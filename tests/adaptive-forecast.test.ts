import { describe, it, expect } from "vitest";
import { adaptiveForecast } from "../src/domain/analytics/adaptive-forecast";
import { behaviorAnalysis } from "../src/domain/analytics/behavior";
import { CashflowForecast } from "../src/domain/analytics/forecast";
import { spendingAnalysis } from "../src/domain/analytics/spending";
import { accountScope } from "../src/domain/account-scope";
import { LedgerService } from "../src/application/ledger-service";
import {
  emptyLedger,
  type Ledger,
  type Transaction,
} from "../src/domain/model";
const tx = (
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  date,
  amount,
  description: id,
  accountId: "bank",
  categoryId: "food",
  tagIds: [],
  notes: "",
  recurrenceId: null,
  transfer: false,
  openingBalance: false,
  ...extra,
});
function fixture(): Ledger {
  return {
    ...emptyLedger(),
    accounts: [
      { id: "bank", name: "Banco" },
      { id: "investment", name: "Investimentos" },
    ],
    categories: [{ id: "food", name: "Alimentação" }],
    settings: {
      primaryAccountId: "bank",
      excludedSpendingAccountIds: ["investment"],
    },
    transactions: [
      tx("seed", "2025-12-01", -1000),
      ...Array.from({ length: 8 }, (_, i) =>
        tx(`food${i}`, `2026-${String(i + 1).padStart(2, "0")}-10`, -10000),
      ),
      tx("now", "2026-09-01", -15000),
      tx("investment", "2026-08-10", -9000000, { accountId: "investment" }),
    ],
  };
}
describe("account scope and preferences", () => {
  it("excludes investments from consolidated spending without removing wealth data or explicit access", () => {
    const state = fixture();
    const primary = accountScope(state, "primary", true);
    expect(primary.accounts.map((a) => a.id)).toEqual(["bank"]);
    expect(accountScope(state, "all").transactions).toHaveLength(
      state.transactions.length,
    );
    expect(accountScope(state, "all", true).transactions).toEqual(
      primary.transactions,
    );
    expect(accountScope(state, "investment", true).transactions).toHaveLength(
      1,
    );
    expect(
      spendingAnalysis(primary, "2026-09-18").future[0].expense.expected,
    ).toBe(10000);
    expect(state.transactions.at(-1)?.amount).toBe(-9000000);
  });
  it("uses all accounts for older ledgers without preferences and filters recurrence generation inputs", () => {
    const state = fixture();
    delete state.settings;
    state.recurrences = [
      {
        id: "investment-rule",
        description: "Aporte",
        amount: -50000,
        accountId: "investment",
        categoryId: null,
        tagIds: [],
        notes: "",
        recurrenceId: null,
        startDate: "2026-10-01",
        endDate: null,
        frequency: "monthly",
        active: true,
      },
    ];
    expect(accountScope(state, "primary").accounts).toHaveLength(2);
    expect(accountScope(state, "bank").recurrences).toEqual([]);
  });
  it("persists preferences, deduplicates exclusions and rejects unknown accounts without mutating state", () => {
    let state = fixture();
    const repo = {
      read: () => structuredClone(state),
      save: (value: Ledger) => {
        state = structuredClone(value);
      },
    };
    const service = new LedgerService(repo, { today: () => "2026-09-18" });
    service.saveSettings({
      primaryAccountId: "investment",
      excludedSpendingAccountIds: ["investment", "investment"],
    });
    expect(
      new LedgerService(repo, { today: () => "2026-09-18" }).snapshot()
        .settings,
    ).toEqual({
      primaryAccountId: "investment",
      excludedSpendingAccountIds: ["investment"],
    });
    const before = structuredClone(state);
    expect(() =>
      service.saveSettings({
        primaryAccountId: "missing",
        excludedSpendingAccountIds: [],
      }),
    ).toThrow("Conta não encontrada");
    expect(() =>
      service.saveSettings({
        primaryAccountId: null,
        excludedSpendingAccountIds: ["missing"],
      }),
    ).toThrow();
    expect(state).toEqual(before);
  });
});
describe("adaptive variable forecasts", () => {
  it("keeps a stable baseline and reports actual validation errors", () => {
    expect(adaptiveForecast(Array(12).fill(10000))).toMatchObject({
      expected: 10000,
      method: "weighted",
      mae: 0,
      wape: 0,
      backtestMonths: 9,
      regimeShift: false,
    });
  });
  it("recognizes sustained growth without classifying a smooth ramp as a regime change", () => {
    const result = adaptiveForecast(
      Array.from({ length: 12 }, (_, i) => 10000 + i * 2000),
    );
    expect(result.method).toBe("trend");
    expect(result.regimeShift).toBe(false);
    expect(result.expected).toBeGreaterThan(32000);
    expect(result.expected).toBeLessThan(35000);
    expect(result.mae).toBeLessThan(2000); // Includes errors before the selector had enough observations.
  });
  it("adapts to a stable new level instead of carrying the old average forward", () => {
    expect(
      adaptiveForecast([...Array(9).fill(10000), ...Array(3).fill(20000)]),
    ).toMatchObject({ method: "recent", expected: 20000, regimeShift: true });
  });
  it("limits isolated spikes without modifying source values or suppressing intermittent expenses", () => {
    const raw = [10000, 10000, 10000, 10000, 200000, 10000, 10000, 10000];
    const before = [...raw];
    const result = adaptiveForecast(raw);
    expect(result.expected).toBe(10000);
    expect(result.outlierMonths).toEqual([4]);
    expect(raw).toEqual(before);
    const sparse = adaptiveForecast([0, 0, 10000, 0, 0, 10000, 0, 0, 10000]);
    expect(sparse.outlierMonths).toEqual([]);
    expect(sparse.expected).toBe(0);
    expect(sparse.supported).toBe(false);
    expect(sparse.intermittent).toBe(true);
    expect(sparse.spread).toBe(0);
  });
  it("requires two annual cycles and validates seasonal predictions against held-out months", () => {
    const year = [
      10000, 13000, 20000, 10000, 15000, 25000, 30000, 10000, 8000, 25000,
      20000, 90000,
    ];
    expect(adaptiveForecast(year).method).not.toBe("seasonal");
    const result = adaptiveForecast([...year, ...year], 2);
    expect(result).toMatchObject({
      method: "seasonal",
      expected: 13000,
    });
    expect(result.mae).toBeGreaterThan(0); // Earlier origins had not observed two annual cycles.
  });
  it("retains a nonzero error for a surprise rather than fitting it with future observations", () => {
    const result = adaptiveForecast([...Array(11).fill(10000), 100000]);
    expect(result.mae).toBe(10000); // One 90000-cent surprise across nine outer tests.
    expect(result.expected).toBe(10000);
  });
  it("withholds unsupported long-horizon ranges and never produces negative forecasts", () => {
    const raw = [40000, 35000, 30000, 25000, 20000, 15000, 10000, 5000];
    expect(adaptiveForecast(raw, 12).low).toBeNull();
    expect(adaptiveForecast(raw, 12).backtestMonths).toBe(0);
    for (const series of [[], [0], [10000], [0, 0, 0], raw]) {
      const r = adaptiveForecast(series, 12);
      expect(Number.isFinite(r.expected)).toBe(true);
      expect(r.expected).toBeGreaterThanOrEqual(0);
    }
  });
  it("uses up to 36 complete months, ignoring pending and future values in training", () => {
    const state = fixture();
    state.transactions.unshift(tx("ancient", "2020-01-01", -1000));
    const base = new CashflowForecast(state, "2026-09");
    state.transactions.push(
      tx("future", "2030-01-01", -9999999),
      tx("pending", "2026-08-01", -9999999, { validationStatus: "pending" }),
    );
    const after = new CashflowForecast(state, "2026-09");
    expect(after.sampleMonths).toHaveLength(9);
    expect(after.missingMonths.length).toBeGreaterThan(0);
    expect(after.month("2026-10").expense.expected).toBe(
      base.month("2026-10").expense.expected,
    );
  });
});
describe("behavior evidence", () => {
  const months = Array.from(
    { length: 6 },
    (_, i) => `2026-${String(i + 1).padStart(2, "0")}`,
  );
  it("separates frequency and ticket contributions and identifies emerging descriptions", () => {
    const rows = months.flatMap((m, i) =>
      Array.from({ length: i < 3 ? 2 : 4 }, (_, j) =>
        tx(
          `${m}:${j}`,
          `${m}-${j % 2 === 0 ? "05" : "20"}`,
          i < 3 ? -1000 : -1500,
          { description: i < 3 ? "Mercado" : "Novo mercado" },
        ),
      ),
    );
    const r = behaviorAnalysis(rows, months, "2026-07-18");
    expect(r).toMatchObject({
      previousAverage: 2000,
      recentAverage: 6000,
      previousCount: 2,
      recentCount: 4,
      frequencyImpact: 2000,
      ticketImpact: 2000,
    });
    expect(r.frequencyImpact + r.ticketImpact).toBe(
      r.recentAverage - r.previousAverage,
    );
    expect(r.drivers.find((d) => d.name === "Novo mercado")).toMatchObject({
      delta: 6000,
      emerging: true,
    });
  });
  it("estimates current pace using the same cutoff without including future postings", () => {
    const rows = months.flatMap((m) => [
      tx(`${m}a`, `${m}-05`, -1000),
      tx(`${m}b`, `${m}-25`, -1000),
    ]);
    rows.push(
      tx("now", "2026-07-05", -2000),
      tx("future", "2026-07-25", -99000),
    );
    expect(behaviorAnalysis(rows, months, "2026-07-18").pace).toBe(4000);
    expect(behaviorAnalysis(rows, months, "2026-07-05").pace).toBeNull();
  });
  it("does not claim a trimester comparison from insufficient data", () => {
    expect(
      behaviorAnalysis([], months.slice(0, 3), "2026-07-18"),
    ).toMatchObject({
      comparable: false,
      change: null,
      drivers: [],
      pace: null,
    });
  });
});

describe("evidence before extrapolation", () => {
  it("does not turn a single September purchase into twelve future monthly expenses", () => {
    const state = fixture();
    state.categories.push({ id: "one-off", name: "Compra pontual" });
    state.transactions.push(
      tx("one-off", "2026-09-12", -223400, { categoryId: "one-off" }),
    );
    const before = structuredClone(state.transactions);
    for (const anchor of ["2026-09", "2026-10"]) {
      const model = new CashflowForecast(state, anchor);
      for (const month of ["2026-10", "2026-11", "2027-01", "2027-09"]) {
        const slice = model
          .month(month)
          .categories.find((c) => c.id === "one-off")!;
        expect(slice.expected).toBe(0);
        expect(slice.high).toBeNull();
        expect(slice.quality).toBe("Sem padrão");
      }
    }
    expect(
      new CashflowForecast(state, "2026-09")
        .month("2026-09")
        .categories.find((c) => c.id === "one-off")!.expected,
    ).toBe(223400);
    expect(state.transactions).toEqual(before);
  });
  it("preserves known future expenses and recurrence commitments without a repeated history", () => {
    const state = fixture();
    state.categories.push({ id: "one-off", name: "Compra pontual" });
    state.transactions.push(
      tx("past", "2026-08-10", -223400, { categoryId: "one-off" }),
      tx("booked", "2026-10-10", -12000, { categoryId: "one-off" }),
    );
    state.recurrences.push({
      id: "new",
      description: "Parcela",
      accountId: "bank",
      categoryId: "one-off",
      amount: -9000,
      tagIds: [],
      notes: "",
      recurrenceId: null,
      startDate: "2026-10-20",
      endDate: null,
      frequency: "monthly",
      active: true,
    });
    const result = new CashflowForecast(state, "2026-09")
      .month("2026-10")
      .categories.find((c) => c.id === "one-off")!;
    expect(result.expected).toBe(21000);
    expect(result.known).toBe(12000);
    expect(result.scheduled).toBe(9000);
  });
  it("does not mistake many purchases concentrated in one month or sparse isolated months for a monthly habit", () => {
    expect(
      adaptiveForecast([0, 0, 0, 223400, 0, 0, 0, 0, 0, 0, 0, 0]),
    ).toMatchObject({ supported: false, expected: 0 });
    expect(
      adaptiveForecast([12000, 0, 0, 0, 0, 15000, 0, 0, 0, 0, 0, 0]),
    ).toMatchObject({ supported: false, expected: 0 });
    expect(adaptiveForecast([0, 0, 0, 10000, 12000, 11000])).toMatchObject({
      supported: true,
    });
  });
});

it("never invents an annual event from a single observation surrounded by zero months", () => {
  for (let i = 0; i < 36; i++) {
    const series = Array(36).fill(0);
    series[i] = 223400;
    for (const horizon of [1, 3, 12])
      expect(adaptiveForecast(series, horizon)).toMatchObject({
        supported: false,
        expected: 0,
      });
  }
});
