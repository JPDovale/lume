import { isConfirmed, type Ledger, type Transaction } from "../model";
import { occurrences } from "../recurrence";
import { monthEnd, monthsBetween, previousMonths } from "./calendar";
import {
  detectMonthlyPatterns,
  merchantKey,
  type MonthlyPattern,
} from "./patterns";
import { estimateSeries, total } from "./statistics";
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
  quality:
    "Sem base" | "Sem histórico" | "Base curta" | "Volátil" | "Consistente";
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
  private ruleKeys: Set<string>;
  private patternKeys: Set<string>;
  private rowsByMonth = new Map<string, Transaction[]>();
  private variableExpenses = new Map<string, Map<string, number>>();
  private variableIncome = new Map<string, number>();
  constructor(ledger: Ledger, anchorMonth: string) {
    this.ledger = ledger;
    this.anchorMonth = anchorMonth;
    const first = ledger.transactions
      .filter((t) => t.date < `${anchorMonth}-01` && isFinancial(t))
      .map((t) => t.date.slice(0, 7))
      .sort()[0];
    this.sampleMonths = previousMonths(anchorMonth, 6).filter(
      (month) => first && month > first,
    );
    this.patterns = detectMonthlyPatterns(ledger, anchorMonth);
    this.patternKeys = new Set(this.patterns.map((p) => p.key));
    this.ruleKeys = new Set(ledger.recurrences.map(merchantKey));
    const samples = new Set(this.sampleMonths);
    for (const t of ledger.transactions) {
      if (t.transfer || t.openingBalance) continue;
      const month = t.date.slice(0, 7);
      const rows = this.rowsByMonth.get(month) ?? [];
      rows.push(t);
      this.rowsByMonth.set(month, rows);
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
    return !!t.recurrenceId || this.ruleKeys.has(merchantKey(t));
  }
  month(month: string): MonthForecast {
    const existing = this.rowsByMonth.get(month) ?? [];
    const scheduled = this.ledger.recurrences.flatMap((r) =>
      occurrences(r, `${month}-01`, monthEnd(month)),
    );
    // Existing postings replace generated occurrences, including an imported posting with the same identity/date.
    const actualSlots = new Set(
      existing
        .filter((t) => !t.recurrenceId)
        .map((t) => `${merchantKey(t)}:${t.date}`),
    );
    const recurrenceSlots = new Set(
      this.ledger.transactions
        .filter((t) => t.recurrenceId)
        .map((t) => `${t.recurrenceId}:${t.recurrenceDate ?? t.date}`),
    );
    const pending = scheduled.filter(
      (t) =>
        !actualSlots.has(`${merchantKey(t)}:${t.date}`) &&
        !recurrenceSlots.has(`${t.recurrenceId}:${t.date}`),
    );
    const candidates = [
      ...this.ledger.categories,
      { id: UNCATEGORIZED, name: "Sem categoria" },
    ];
    const slice = (
      id: string,
      name: string,
      positive: boolean,
    ): ForecastSlice => {
      const matches = (t: Transaction) =>
        (positive ? t.amount > 0 : t.amount < 0) &&
        (id === "__total__" || categoryKey(t) === id);
      const history = this.sampleMonths.map((month) =>
        positive
          ? (this.variableIncome.get(month) ?? 0)
          : (this.variableExpenses.get(month)?.get(id) ?? 0),
      );
      const model = estimateSeries(
        history,
        Math.max(1, monthsBetween(this.anchorMonth, month) + 1),
      );
      const knownRows = existing.filter((t) => matches(t) && isConfirmed(t)),
        pendingRows = [
          ...pending,
          ...existing.filter((t) => !isConfirmed(t)),
        ].filter(matches);
      const known = total(knownRows.map((t) => Math.abs(t.amount)));
      const native =
        total(
          knownRows
            .filter((t) => this.isNative(t))
            .map((t) => Math.abs(t.amount)),
        ) + total(pendingRows.map((t) => Math.abs(t.amount)));
      const detectedKnown = total(
        knownRows
          .filter(
            (t) => !this.isNative(t) && this.patternKeys.has(merchantKey(t)),
          )
          .map((t) => Math.abs(t.amount)),
      );
      const patterns = this.patterns.filter(
        (p) =>
          (positive ? p.amount > 0 : p.amount < 0) &&
          (id === "__total__" || (p.categoryId ?? UNCATEGORIZED) === id),
      );
      const detectedPending = total(
        patterns
          .filter((p) => !knownRows.some((t) => merchantKey(t) === p.key))
          .map((p) => Math.abs(p.amount)),
      );
      const detected = detectedKnown + detectedPending;
      const knownVariable = total(
        knownRows
          .filter(
            (t) => !this.isNative(t) && !this.patternKeys.has(merchantKey(t)),
          )
          .map((t) => Math.abs(t.amount)),
      );
      // Scheduled variable spending is a floor for the baseline, not an extra copy of expected spending.
      const variable = Math.max(knownVariable, model.expected);
      const enough = history.length >= 2;
      const quality = !enough
        ? "Sem base"
        : history.every((value) => value === 0) && native + detected === 0
          ? "Sem histórico"
          : history.length < 4
            ? "Base curta"
            : model.spread > model.level * 0.5
              ? "Volátil"
              : "Consistente";
      return {
        id,
        name,
        known,
        scheduled: total(pendingRows.map((t) => Math.abs(t.amount))),
        detected,
        variable,
        expected: enough ? native + detected + variable : null,
        low: enough
          ? native +
            detectedKnown +
            Math.round(detectedPending * 0.88) +
            Math.max(knownVariable, model.expected - model.spread)
          : null,
        high: enough
          ? native +
            detectedKnown +
            Math.round(detectedPending * 1.12) +
            Math.max(knownVariable, model.expected + model.spread)
          : null,
        trend: model.trend,
        sampleMonths: history.length,
        quality,
      };
    };
    const categories = candidates.map((c) => slice(c.id, c.name, false));
    const aggregate = (slices: ForecastSlice[]): ForecastSlice => ({
      id: "__total__",
      name: "Despesas",
      known: total(slices.map((c) => c.known)),
      scheduled: total(slices.map((c) => c.scheduled)),
      detected: total(slices.map((c) => c.detected)),
      variable: total(slices.map((c) => c.variable)),
      expected:
        this.sampleMonths.length >= 2
          ? total(slices.map((c) => c.expected ?? 0))
          : null,
      low:
        this.sampleMonths.length >= 2
          ? total(slices.map((c) => c.low ?? 0))
          : null,
      high:
        this.sampleMonths.length >= 2
          ? total(slices.map((c) => c.high ?? 0))
          : null,
      trend: total(slices.map((c) => c.trend)),
      sampleMonths: this.sampleMonths.length,
      quality:
        this.sampleMonths.length < 2
          ? "Sem base"
          : this.sampleMonths.length < 4
            ? "Base curta"
            : slices.some((c) => c.quality === "Volátil")
              ? "Volátil"
              : "Consistente",
    });
    return {
      month,
      categories,
      expense: aggregate(categories),
      income: slice("__total__", "Receitas", true),
    };
  }
}
