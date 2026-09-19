import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  type Ledger,
  type Transaction,
  type Recurrence,
} from "../src/domain/model";
import { CashflowForecast } from "../src/domain/analytics/forecast";
import { inferRecurrenceHistory } from "../src/domain/analytics/recurrence-history";
const tx = (
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  date,
  amount,
  description: "Lançamento importado",
  accountId: "bank",
  categoryId: "salary",
  tagIds: [],
  notes: "",
  recurrenceId: null,
  transfer: false,
  openingBalance: false,
  ...extra,
});
const salary: Recurrence = {
  id: "salary-rule",
  description: "Salário",
  amount: 500000,
  accountId: "bank",
  categoryId: "salary",
  tagIds: [],
  notes: "",
  recurrenceId: null,
  startDate: "2026-10-01",
  endDate: null,
  frequency: "monthly",
  active: true,
};
function fixture(): Ledger {
  return {
    ...emptyLedger(),
    accounts: [
      { id: "bank", name: "Banco" },
      { id: "other", name: "Outra conta" },
    ],
    categories: [
      { id: "salary", name: "Trabalho" },
      { id: "debt", name: "Dívidas" },
      { id: "food", name: "Alimentação" },
    ],
    recurrences: [salary],
    transactions: Array.from({ length: 12 }, (_, i) => {
      const date = new Date(Date.UTC(2025, 8 + i, 1))
        .toISOString()
        .slice(0, 10);
      return tx(`salary-${i}`, date, i < 5 ? 300000 : 500000);
    }),
  };
}
describe("forecast coherence", () => {
  it("counts a scheduled salary and its compatible anonymous imported history once", () => {
    const state = fixture(),
      before = structuredClone(state);
    const result = new CashflowForecast(state, "2026-09").month("2026-10");
    expect(result.income).toMatchObject({
      expected: 500000,
      scheduled: 500000,
      variable: 0,
      reconciledRecurrences: 1,
    });
    expect(state).toEqual(before);
  });
  it("does not discard a second named source of income or unrelated anonymous future receipt", () => {
    const state = fixture();
    for (const m of ["06", "07", "08"])
      state.transactions.push(
        tx(`extra-${m}`, `2026-${m}-15`, 100000, { description: "Freelance" }),
      );
    state.transactions.push(tx("future-bonus", "2026-10-01", 900000));
    const future = new CashflowForecast(state, "2026-09").month("2026-10");
    expect(future.income.expected).toBe(1500000); // future bonus + explicit salary + separately inferred freelance
    expect(future.income.scheduled).toBe(500000);
  });
  it("replaces an occurrence with a compatible future imported posting, even when its payment date shifted", () => {
    const state = fixture();
    state.transactions.push(tx("posted", "2026-10-05", 510000));
    const future = new CashflowForecast(state, "2026-09").month("2026-10");
    expect(future.income).toMatchObject({
      known: 510000,
      scheduled: 0,
      expected: 510000,
    });
  });
  it("requires unique consecutive evidence, matching account/category/sign and anonymous descriptions", () => {
    for (const extra of [
      { accountId: "other" },
      { categoryId: "food" },
      { amount: -500000 },
      { description: "Segundo salário" },
      { transfer: true },
      { validationStatus: "pending" as const },
    ]) {
      const state = fixture();
      state.transactions = state.transactions.map((t) => ({ ...t, ...extra }));
      expect(inferRecurrenceHistory(state, "2026-09").size).toBe(0);
    }
    const missing = fixture();
    missing.transactions = missing.transactions.filter(
      (t) => !t.date.startsWith("2026-07"),
    );
    expect(inferRecurrenceHistory(missing, "2026-09").size).toBe(0);
    const ambiguous = fixture();
    ambiguous.recurrences.push({ ...salary, id: "competing" });
    expect(inferRecurrenceHistory(ambiguous, "2026-09").size).toBe(0);
    const duplicate = fixture();
    duplicate.transactions.push(tx("duplicate", "2026-07-01", 500000));
    expect(inferRecurrenceHistory(duplicate, "2026-09").size).toBe(0);
  });
  it("does not infer an association from future payments", () => {
    const state = fixture();
    state.transactions = state.transactions.map((t) => ({
      ...t,
      date: t.date.replace("2026", "2027").replace("2025", "2027"),
    }));
    expect(inferRecurrenceHistory(state, "2026-09").size).toBe(0);
  });
  it("reconciles like-for-like totals while preserving confirmed spending above income", () => {
    const state = fixture();
    const amounts = [
      70000, 80000, 90000, 60000, 80000, 900000, 240000, 160000, 600000, 280000,
      75000, 90000,
    ];
    state.transactions.push(
      ...state.transactions.map((t, i) =>
        tx(`debt-${i}`, t.date, -amounts[i], {
          categoryId: "debt",
          description: `Debt ${i}`,
        }),
      ),
    );
    const model = new CashflowForecast(state, "2026-09");
    for (const month of ["2026-10", "2026-11", "2027-09"]) {
      const f = model.month(month);
      for (const field of ["expected"] as const) {
        expect(f.expense[field]).toBe(
          f.categories.reduce((s, c) => s + (c[field] ?? 0), 0),
        );
        for (const c of f.categories)
          expect(c[field]!).toBeLessThanOrEqual(f.expense[field]!);
      }
      if (f.expense.low !== null) {
        expect(f.expense.low).toBeLessThanOrEqual(f.expense.expected!);
        expect(f.expense.high).toBeGreaterThanOrEqual(f.expense.expected!);
      } else expect(f.expense.high).toBeNull();
    }
    state.transactions.push(
      tx("known-large", "2026-10-15", -700000, {
        categoryId: "debt",
        description: "Pagamento confirmado",
      }),
    );
    const f = new CashflowForecast(state, "2026-09").month("2026-10");
    expect(
      f.categories.find((c) => c.id === "debt")!.expected,
    ).toBeGreaterThanOrEqual(700000);
    expect(f.expense.expected!).toBeGreaterThan(f.income.expected!);
  });
});

it("reconciles expense commitments independently from salary and exposes both counts", () => {
  const state = fixture();
  state.transactions.push(
    ...state.transactions.map((t) => ({
      ...t,
      id: `expense:${t.id}`,
      categoryId: "food",
      amount: -20000,
    })),
  );
  state.recurrences.push({
    ...salary,
    id: "food-rule",
    description: "Assinatura",
    categoryId: "food",
    amount: -20000,
  });
  const f = new CashflowForecast(state, "2026-09").month("2026-10");
  expect(f.income).toMatchObject({
    expected: 500000,
    reconciledRecurrences: 1,
  });
  expect(f.expense).toMatchObject({
    expected: 20000,
    reconciledRecurrences: 1,
  });
});
