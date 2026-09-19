import { inferRecurrenceHistory } from "./recurrence-history";
import {
  statisticalForecaster,
  type SeriesForecaster,
} from "../forecasting/series";
import {
  combineDistributions,
  empiricalDistribution,
  fixedDistribution,
  type Distribution,
} from "../forecasting/distribution";
import { recurringAmount } from "../forecasting/recurring";
import { forecastFeedback } from "../forecasting/feedback";
import { forecastPolicy } from "../forecasting/policy";
import { isConfirmed, type Ledger, type Transaction } from "../model";
import { occurrences } from "../recurrence";
import { monthEnd, monthsBetween, previousMonths } from "./calendar";
import {
  detectMonthlyPatterns,
  merchantKey,
  type MonthlyPattern,
} from "./patterns";
import { total } from "./statistics";
export const UNCATEGORIZED = "__uncategorized__";
export const categoryKey = (t: Pick<Transaction, "categoryId">) =>
  t.categoryId ?? UNCATEGORIZED;
export const isFinancial = (t: Transaction) =>
  !t.transfer && !t.openingBalance && isConfirmed(t);
export type ForecastSlice = {
  id: string;
  name: string;
  known: number;
  scheduled: number;
  detected: number;
  variable: number;
  expected: number | null;
  low: number | null;
  high: number | null;
  trend: number;
  sampleMonths: number;
  diagnostics?: ReturnType<SeriesForecaster["forecast"]>;
  baseExpected?: number | null;
  learningMonths?: number;
  distribution?: Distribution;
  approximate?: number;
  reconciledRecurrences?: number;
  quality:
    | "Sem padrão"
    | "Sem base"
    | "Sem histórico"
    | "Base curta"
    | "Volátil"
    | "Consistente";
};
export type MonthForecast = {
  month: string;
  categories: ForecastSlice[];
  expense: ForecastSlice;
  income: ForecastSlice;
};
export class CashflowForecast {
  readonly sampleMonths: string[];
  readonly patterns: MonthlyPattern[];
  private ledger: Ledger;
  private anchorMonth: string;
  private inferredHistory: ReturnType<typeof inferRecurrenceHistory>;
  private forecaster: SeriesForecaster;
  readonly missingMonths: string[];
  private cache = new Map<string, MonthForecast>();
  private patternKeys: Set<string>;
  private rowsByMonth = new Map<string, Transaction[]>();
  private variableExpenses = new Map<string, Map<string, number>>();
  private observedVariableCategories = new Set<string>();
  private observedVariableIncome = false;
  private variableIncome = new Map<string, number>();
  constructor(
    ledger: Ledger,
    anchorMonth: string,
    forecaster: SeriesForecaster = statisticalForecaster,
  ) {
    this.ledger = ledger;
    this.forecaster = forecaster;
    this.anchorMonth = anchorMonth;
    const first = ledger.transactions
      .filter((t) => t.date < `${anchorMonth}-01` && isFinancial(t))
      .map((t) => t.date.slice(0, 7))
      .sort()[0];
    const candidateMonths = previousMonths(
      anchorMonth,
      forecastPolicy.historyMonths,
    ).filter((month) => first && month > first);
    const activity = new Set(
      ledger.transactions.filter(isFinancial).map((t) => t.date.slice(0, 7)),
    );
    this.missingMonths = candidateMonths.filter(
      (month) => !activity.has(month),
    );
    const lastGap = this.missingMonths.at(-1);
    this.sampleMonths = candidateMonths.filter(
      (month) => !lastGap || month > lastGap,
    );
    this.inferredHistory = inferRecurrenceHistory(ledger, anchorMonth);
    this.patterns = detectMonthlyPatterns(
      {
        ...ledger,
        transactions: ledger.transactions.filter(
          (t) => !this.inferredHistory.has(t.id),
        ),
      },
      anchorMonth,
    );
    this.patternKeys = new Set(this.patterns.map((p) => p.key));
    const samples = new Set(this.sampleMonths);
    for (const t of ledger.transactions) {
      if (t.transfer || t.openingBalance) continue;
      const month = t.date.slice(0, 7);
      const rows = this.rowsByMonth.get(month) ?? [];
      rows.push(t);
      this.rowsByMonth.set(month, rows);
      if (
        isConfirmed(t) &&
        (samples.has(month) || month === anchorMonth) &&
        !this.isNative(t) &&
        !this.patternKeys.has(merchantKey(t))
      ) {
        if (t.amount > 0) this.observedVariableIncome = true;
        else this.observedVariableCategories.add(categoryKey(t));
      }
      if (
        !isConfirmed(t) ||
        !samples.has(month) ||
        this.isNative(t) ||
        this.patternKeys.has(merchantKey(t))
      )
        continue;
      if (t.amount > 0)
        this.variableIncome.set(
          month,
          (this.variableIncome.get(month) ?? 0) + t.amount,
        );
      else {
        const categories =
          this.variableExpenses.get(month) ?? new Map<string, number>();
        categories.set(
          categoryKey(t),
          (categories.get(categoryKey(t)) ?? 0) - t.amount,
        );
        this.variableExpenses.set(month, categories);
      }
    }
  }
  private isNative(t: Transaction) {
    return !!t.recurrenceId || this.inferredHistory.has(t.id);
  }
  month(month: string): MonthForecast {
    const cached = this.cache.get(month);
    if (cached) return cached;
    const existing = this.rowsByMonth.get(month) ?? [];
    const scheduled = this.ledger.recurrences.flatMap((r) =>
      occurrences(r, `${month}-01`, monthEnd(month)),
    );
    const slots = new Set(
      this.ledger.transactions
        .filter((t) => t.recurrenceId)
        .map((t) => `${t.recurrenceId}:${t.recurrenceDate ?? t.date}`),
    );
    const inferredSlots = new Set(
      existing.flatMap((t) => {
        const r = this.inferredHistory.get(t.id);
        return r ? [r.id] : [];
      }),
    );
    // A uniquely identified, same-date named posting replaces a schedule without requiring three historical months.
    const namedMatched = new Set<string>();
    const namedSlots = new Set<string>();
    for (const t of scheduled) {
      const candidates = existing.filter(
        (e) =>
          !e.recurrenceId &&
          merchantKey(e) === merchantKey(t) &&
          e.date === t.date,
      );
      const competing = scheduled.filter(
        (e) => merchantKey(e) === merchantKey(t) && e.date === t.date,
      );
      if (candidates.length === 1 && competing.length === 1) {
        namedMatched.add(candidates[0].id);
        namedSlots.add(t.id);
      }
    }
    const pending = scheduled.filter(
      (t) =>
        !namedSlots.has(t.id) &&
        !slots.has(`${t.recurrenceId}:${t.date}`) &&
        !inferredSlots.has(t.recurrenceId!),
    );
    const horizon = Math.max(1, monthsBetween(this.anchorMonth, month) + 1);
    const amountCache = new Map<string, Distribution>();
    for (const t of pending) {
      const rule = this.ledger.recurrences.find(
        (r) => r.id === t.recurrenceId,
      )!;
      amountCache.set(
        t.id,
        recurringAmount(
          rule,
          this.ledger,
          this.anchorMonth,
          t.date,
          this.inferredHistory,
        ),
      );
    }
    const slice = (
      id: string,
      name: string,
      positive: boolean,
    ): ForecastSlice => {
      const matches = (t: Transaction) =>
        (positive ? t.amount > 0 : t.amount < 0) &&
        (id === "__total__" || categoryKey(t) === id);
      const history = this.sampleMonths.map((m) =>
        positive
          ? (this.variableIncome.get(m) ?? 0)
          : (this.variableExpenses.get(m)?.get(id) ?? 0),
      );
      const model = this.forecaster.forecast(history, horizon);
      const knownRows = existing.filter((t) => matches(t) && isConfirmed(t));
      const existingPending = existing.filter(
        (t) => matches(t) && !isConfirmed(t),
      );
      const futurePending = pending.filter(matches);
      const known = total(knownRows.map((t) => Math.abs(t.amount)));
      const nativeKnown = total(
        knownRows
          .filter((t) => this.isNative(t) || namedMatched.has(t.id))
          .map((t) => Math.abs(t.amount)),
      );
      const scheduledParts = [
        ...futurePending.map((t) => amountCache.get(t.id)!),
        ...existingPending.map((t) =>
          empiricalDistribution(Math.abs(t.amount), []),
        ),
      ];
      const scheduledAmount = total(scheduledParts.map((p) => p.expected));
      const knownPattern = total(
        knownRows
          .filter(
            (t) =>
              !this.isNative(t) &&
              !namedMatched.has(t.id) &&
              this.patternKeys.has(merchantKey(t)),
          )
          .map((t) => Math.abs(t.amount)),
      );
      const patterns = this.patterns.filter(
        (p) =>
          (positive ? p.amount > 0 : p.amount < 0) &&
          (id === "__total__" || (p.categoryId ?? UNCATEGORIZED) === id),
      );
      const unpostedPatterns = patterns.filter(
        (p) =>
          ![...knownRows, ...existingPending].some(
            (t) => merchantKey(t) === p.key,
          ),
      );
      const detectedPending = unpostedPatterns.map((p) => {
        const rows = this.ledger.transactions
          .filter(
            (t) =>
              isFinancial(t) &&
              t.date < `${this.anchorMonth}-01` &&
              merchantKey(t) === p.key,
          )
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-36);
        const amounts = rows.map((t) => Math.abs(t.amount)),
          estimation = this.forecaster.forecast(amounts, horizon);
        // A detected habit can stop. With no held-out evidence, its uncertainty stays unavailable.
        return empiricalDistribution(
          estimation.expected || Math.abs(p.amount),
          estimation.errors.map((e) => ({
            month: rows[e.targetIndex].date.slice(0, 7),
            amount: Math.max(0, estimation.expected + e.error),
          })),
        );
      });
      const detected =
        knownPattern + total(detectedPending.map((p) => p.expected));
      const knownVariable = total(
        knownRows
          .filter(
            (t) =>
              !this.isNative(t) &&
              !namedMatched.has(t.id) &&
              !this.patternKeys.has(merchantKey(t)),
          )
          .map((t) => Math.abs(t.amount)),
      );
      const observed = positive
        ? this.observedVariableIncome
        : this.observedVariableCategories.has(id);
      const feedback = forecastFeedback(
        this.ledger,
        this.anchorMonth,
        horizon,
        id === UNCATEGORIZED ? null : id,
        positive,
      );
      const adjustment = model.supported ? feedback.adjustment : 0;
      const variable = Math.max(knownVariable, model.expected + adjustment);
      const baseExpected =
        nativeKnown +
        scheduledAmount +
        detected +
        Math.max(knownVariable, model.expected);
      const noVariableEvidence = !observed && history.every((v) => v === 0);
      const variablePart = noVariableEvidence
        ? fixedDistribution(variable)
        : empiricalDistribution(
            variable,
            model.errors.map((e) => ({
              month: this.sampleMonths[e.targetIndex],
              amount: Math.max(knownVariable, variable + e.error),
            })),
          );
      const distribution = combineDistributions([
        fixedDistribution(nativeKnown + knownPattern),
        ...scheduledParts,
        ...detectedPending,
        variablePart,
      ]);
      const hasBasis = history.length >= 2 || known + scheduledAmount > 0;
      const expected = hasBasis ? distribution.expected : null;
      const quality: ForecastSlice["quality"] = !hasBasis
        ? "Sem base"
        : !model.supported &&
            observed &&
            nativeKnown + scheduledAmount + detected === 0
          ? "Sem padrão"
          : !observed && nativeKnown + scheduledAmount + detected === 0
            ? "Sem histórico"
            : history.length < 4
              ? "Base curta"
              : model.mae !== null &&
                  model.mae > Math.max(1, model.expected) * 0.5
                ? "Volátil"
                : "Consistente";
      return {
        id,
        name,
        known,
        scheduled: scheduledAmount,
        detected,
        variable,
        expected,
        baseExpected: hasBasis ? baseExpected : null,
        learningMonths: feedback.applied ? feedback.months : 0,
        distribution,
        low: expected === null ? null : distribution.low,
        high: expected === null ? null : distribution.high,
        diagnostics: model,
        approximate: scheduledParts.filter((p) => p.rangeSource !== "fixed")
          .length,
        reconciledRecurrences: new Set(
          [...this.inferredHistory.values()]
            .filter(
              (r) =>
                (positive ? r.amount > 0 : r.amount < 0) &&
                (id === "__total__" || (r.categoryId ?? UNCATEGORIZED) === id),
            )
            .map((r) => r.id),
        ).size,
        trend: model.trend,
        sampleMonths: history.length,
        quality,
      };
    };
    const categories = [
      ...this.ledger.categories,
      { id: UNCATEGORIZED, name: "Sem categoria" },
    ].map((c) => slice(c.id, c.name, false));
    const sum = (
      field: "known" | "scheduled" | "detected" | "variable" | "trend",
    ) => total(categories.map((c) => c[field]));
    const distribution = combineDistributions(
      categories.map((c) => c.distribution!),
    );
    const hasBasis =
      this.sampleMonths.length >= 2 ||
      categories.some((c) => (c.expected ?? 0) > 0);
    const expense: ForecastSlice = {
      id: "__total__",
      name: "Despesas",
      known: sum("known"),
      scheduled: sum("scheduled"),
      detected: sum("detected"),
      variable: sum("variable"),
      trend: sum("trend"),
      expected: hasBasis ? distribution.expected : null,
      baseExpected: hasBasis
        ? total(categories.map((c) => c.baseExpected ?? 0))
        : null,
      distribution,
      low: hasBasis ? distribution.low : null,
      high: hasBasis ? distribution.high : null,
      sampleMonths: this.sampleMonths.length,
      reconciledRecurrences: total(
        categories.map((c) => c.reconciledRecurrences ?? 0),
      ),
      quality: !hasBasis
        ? "Sem base"
        : this.sampleMonths.length < 4
          ? "Base curta"
          : categories.some((c) => c.quality === "Volátil")
            ? "Volátil"
            : "Consistente",
    };
    const result = {
      month,
      categories,
      expense,
      income: slice("__total__", "Entradas", true),
    };
    this.cache.set(month, result);
    return result;
  }
}
