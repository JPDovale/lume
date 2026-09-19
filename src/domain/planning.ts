import { FORECAST_VERSION } from "./forecasting/policy";
import { recurrenceSignature } from "./forecasting/recurring";
import { monthsBetween } from "./analytics/calendar";
import { isConfirmed, money, type Ledger } from "./model";
import { CashflowForecast, UNCATEGORIZED } from "./analytics/forecast";
import { monthEnd } from "./analytics/calendar";
import { allocateReserves, percentOf } from "./planning-allocation";
import {
  planConfigSchema,
  planId,
  sameAccounts,
  type MonthlyPlan,
  type PlanActuals,
  type PlanConfig,
  type PlanProposal,
} from "./planning-model";
const key = (id: string | null) => id ?? UNCATEGORIZED;
export function planningScope(ledger: Ledger, ids: string[]): Ledger {
  const selected = new Set(ids);
  return {
    ...ledger,
    accounts: ledger.accounts.filter((a) => selected.has(a.id)),
    transactions: ledger.transactions.filter((t) => selected.has(t.accountId)),
    recurrences: ledger.recurrences.filter((r) => selected.has(r.accountId)),
  };
}
export function suggestPlanConfig(
  ledger: Ledger,
  month: string,
  accountIds: string[],
  today: string,
): PlanConfig {
  const previous = (ledger.monthlyPlans ?? [])
    .filter(
      (p) =>
        p.config.month < month && sameAccounts(p.config.accountIds, accountIds),
    )
    .sort((a, b) => b.config.month.localeCompare(a.config.month))[0];
  const model = new CashflowForecast(
    planningScope(ledger, accountIds),
    today.slice(0, 7),
  );
  const forecast = model.month(month);
  const valid = new Set(ledger.categories.map((c) => c.id));
  return {
    month,
    accountIds,
    savingsBps: previous?.config.savingsBps ?? 2000,
    incomeOverride: null,
    categories: previous
      ? planConfigSchema
          .parse(previous.config)
          .categories.filter(
            (c) => c.categoryId === null || valid.has(c.categoryId),
          )
      : forecast.categories
          .filter((c) => (c.expected ?? 0) > 0 || c.known + c.scheduled > 0)
          .map((c) => ({
            categoryId: c.id === UNCATEGORIZED ? null : c.id,
            reserveBps: 10000,
          })),
  };
}
/** Statistical evidence is independent of allocation controls and can be reused while dragging. */
export function buildPlanBasis(
  ledger: Ledger,
  month: string,
  accountIds: string[],
  today: string,
) {
  const scoped = planningScope(ledger, accountIds);
  const anchor = month < today.slice(0, 7) ? month : today.slice(0, 7);
  const model = new CashflowForecast(scoped, anchor);
  return {
    forecast: model.month(month),
    anchor,
    horizon: Math.max(1, monthsBetween(anchor, month) + 1),
    recurrences: recurrenceSignature(scoped),
    accountNames: scoped.accounts.map((a) => a.name),
    sampleMonths: model.sampleMonths.length,
    hasGaps: model.missingMonths.length > 0,
  };
}
export function proposePlan(
  ledger: Ledger,
  config: PlanConfig,
  today: string,
  basis = buildPlanBasis(ledger, config.month, config.accountIds, today),
): PlanProposal {
  config = planConfigSchema.parse(config);
  const { forecast } = basis;
  const income =
    config.incomeOverride ??
    forecast.income.expected ??
    forecast.income.known + forecast.income.scheduled;
  if (!Number.isSafeInteger(income) || income < 0)
    throw new Error("Entrada prevista fora do limite permitido.");
  const savingsGoal = percentOf(income, config.savingsBps),
    spendingBudget = income - savingsGoal;
  const selected = new Set(config.categories.map((c) => key(c.categoryId)));
  const outsideCommitted = forecast.categories
    .filter((c) => !selected.has(c.id))
    .reduce((s, c) => s + c.known + c.scheduled, 0);
  const allocations = config.categories.map((selection) => {
    const f = forecast.categories.find(
      (c) => c.id === key(selection.categoryId),
    );
    const baseline = Math.max(0, f?.expected ?? 0);
    return {
      categoryId: selection.categoryId,
      name:
        ledger.categories.find((c) => c.id === selection.categoryId)?.name ??
        "Sem categoria",
      reserveBps: selection.reserveBps,
      requested: percentOf(baseline, selection.reserveBps),
      baseline,
      allocated: 0,
      committed: (f?.known ?? 0) + (f?.scheduled ?? 0),
      shareBps: 0,
      learnedMonths: f?.learningMonths ?? 0,
      historicalOverruns: 0,
      seeded: baseline === 0,
    };
  });
  const available = Math.max(0, spendingBudget - outsideCommitted);
  const amounts = allocateReserves(available, allocations);
  allocations.forEach((c, i) => {
    c.allocated = amounts[i];
    c.shareBps = income ? Math.round((c.allocated / income) * 10000) : 0;
  });
  const unallocated = Math.max(
    0,
    spendingBudget - outsideCommitted - amounts.reduce((s, v) => s + v, 0),
  );
  const proposal: PlanProposal = {
    config,
    forecast: {
      version: FORECAST_VERSION,
      anchor: basis.anchor,
      horizon: basis.horizon,
      recurrences: basis.recurrences,
      income: forecast.income.baseExpected ?? null,
      categories: forecast.categories.map((c) => ({
        categoryId: c.id === UNCATEGORIZED ? null : c.id,
        expected: c.baseExpected ?? null,
      })),
    },
    accountNames: basis.accountNames,
    income,
    incomeSource:
      config.incomeOverride !== null
        ? "manual"
        : forecast.income.expected !== null
          ? "history"
          : "known",
    savingsGoal,
    spendingBudget,
    allocations,
    outsideCommitted,
    unallocated,
    sampleMonths: basis.sampleMonths,
    alerts: [],
  };
  if (basis.hasGaps)
    proposal.alerts.push({
      id: "gaps",
      level: "info",
      message:
        "Há meses sem registros no histórico. A previsão usa o trecho contínuo mais recente para não interpretar lacunas como gasto zero.",
    });
  const needs =
    allocations.reduce((sum, c) => sum + c.baseline, 0) + outsideCommitted;
  if (needs > spendingBudget)
    proposal.alerts.push({
      id: "adjustment",
      level: "warning",
      message: `O padrão de gastos supera o orçamento em ${money(needs - spendingBudget)}. Os limites planejados exigem reduzir gastos em relação ao histórico.`,
    });
  const requested =
    outsideCommitted +
    allocations.reduce((sum, c) => sum + Math.max(c.requested, c.committed), 0);
  if (
    requested > spendingBudget &&
    allocations.some((c) => c.allocated < c.requested)
  )
    proposal.alerts.push({
      id: "reserves-adjusted",
      level: "warning",
      message: `As reservas solicitadas ultrapassam o orçamento em ${money(requested - spendingBudget)}. A parte acima dos compromissos foi reduzida proporcionalmente; confira os limites ajustados.`,
    });
  if (
    spendingBudget > 0 &&
    outsideCommitted + allocations.reduce((sum, c) => sum + c.committed, 0) >=
      spendingBudget * 0.9
  )
    proposal.alerts.push({
      id: "tight",
      level: "warning",
      message:
        "Mais de 90% do orçamento está comprometido. Há pouca margem para imprevistos.",
    });
  if (basis.sampleMonths < 2 && config.incomeOverride === null)
    proposal.alerts.push({
      id: "short-history",
      level: "info",
      message:
        "Histórico curto: a entrada considera somente valores conhecidos. Você pode informar uma previsão manual.",
    });
  if (!income)
    proposal.alerts.push({
      id: "no-income",
      level: "warning",
      message:
        "Sem entrada prevista. Informe uma estimativa ou registre seus recebimentos para distribuir o orçamento.",
    });
  if (outsideCommitted > 0)
    proposal.alerts.push({
      id: "outside",
      level: "warning",
      message: `${money(outsideCommitted)} em compromissos de categorias fora do plano. Esse valor já foi descontado da distribuição.`,
    });
  const deficit =
    amounts.reduce((s, v) => s + v, 0) + outsideCommitted - spendingBudget;
  if (deficit > 0)
    proposal.alerts.push({
      id: "commitments",
      level: "critical",
      message: `A meta de sobra não cabe nos compromissos conhecidos: faltam ${money(deficit)}. Reduzir os percentuais não cancela compromissos registrados.`,
    });
  return proposal;
}
export function measurePlan(
  plan: PlanProposal,
  ledger: Ledger,
  today: string,
): PlanActuals {
  const scope = new Set(plan.config.accountIds),
    limit =
      today < monthEnd(plan.config.month) ? today : monthEnd(plan.config.month);
  const rows = ledger.transactions.filter(
    (t) =>
      scope.has(t.accountId) &&
      t.date.startsWith(plan.config.month) &&
      t.date <= limit &&
      !t.transfer &&
      !t.openingBalance,
  );
  const confirmed = rows.filter(isConfirmed);
  const income = confirmed
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0),
    expense = confirmed
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s - t.amount, 0);
  const ids = new Set([
    ...plan.allocations.map((c) => c.categoryId),
    ...confirmed.filter((t) => t.amount < 0).map((t) => t.categoryId),
  ]);
  const categories = [...ids].map((categoryId) => {
    const planned = plan.allocations.find((c) => c.categoryId === categoryId);
    const actual = confirmed
      .filter((t) => t.amount < 0 && t.categoryId === categoryId)
      .reduce((s, t) => s - t.amount, 0);
    return {
      categoryId,
      name:
        planned?.name ??
        ledger.categories.find((c) => c.id === categoryId)?.name ??
        "Sem categoria",
      planned: planned?.allocated ?? 0,
      actual,
      difference: actual - (planned?.allocated ?? 0),
      included: !!planned,
    };
  });
  const pending = rows.filter((t) => !isConfirmed(t));
  const savings = income - expense,
    requiredSavings = percentOf(income, plan.config.savingsBps);
  return {
    income,
    expense,
    savings,
    savingsBps: income ? Math.round((savings / income) * 10000) : null,
    requiredSavings,
    goalMet: income > 0 && savings >= requiredSavings,
    pendingCount: pending.length,
    pendingExpense: pending
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s - t.amount, 0),
    categories,
  };
}
export function closeExpiredPlans(ledger: Ledger, today: string): boolean {
  let changed = false;
  for (const plan of ledger.monthlyPlans ?? []) {
    if (plan.config.month >= today.slice(0, 7)) continue;
    const previous = (ledger.planResults ?? []).find((r) => r.id === plan.id);
    const snapshot = previous?.plan ?? structuredClone(plan);
    const actual = measurePlan(snapshot, ledger, monthEnd(plan.config.month));
    if (previous && JSON.stringify(previous.actual) === JSON.stringify(actual))
      continue;
    const result = {
      id: plan.id,
      plan: snapshot,
      actual,
      closedAt: previous?.closedAt ?? today,
      updatedAt: today,
      revision: (previous?.revision ?? 0) + 1,
    };
    ledger.planResults = [
      ...(ledger.planResults ?? []).filter((r) => r.id !== plan.id),
      result,
    ];
    changed = true;
  }
  return changed;
}
export function savePlanRecord(
  ledger: Ledger,
  proposal: PlanProposal,
  today: string,
  updatedAt: string = today,
): MonthlyPlan {
  const id = planId(proposal.config.month, proposal.config.accountIds),
    previous = (ledger.monthlyPlans ?? []).find((p) => p.id === id);
  return {
    ...proposal,
    id,
    createdAt: previous?.createdAt ?? today,
    updatedAt,
  };
}
