import { describe, it, expect } from "vitest";
import { forecastSeries } from "../src/domain/forecasting/series";
import { intermittentState } from "../src/domain/forecasting/models";
import {
  empiricalDistribution,
  combineDistributions,
  fixedDistribution,
} from "../src/domain/forecasting/distribution";
import {
  recurringAmount,
  recurrenceSignature,
} from "../src/domain/forecasting/recurring";
import { forecastFeedback } from "../src/domain/forecasting/feedback";
import { FORECAST_VERSION } from "../src/domain/forecasting/policy";
import { CashflowForecast } from "../src/domain/analytics/forecast";
import {
  emptyLedger,
  transactionSchema,
  type Ledger,
  type Recurrence,
} from "../src/domain/model";
import {
  proposePlan,
  savePlanRecord,
  closeExpiredPlans,
} from "../src/domain/planning";
import { shiftMonth } from "../src/domain/analytics/calendar";
const rule: Recurrence = {
  id: "energy",
  description: "Energia",
  amount: -10000,
  amountMode: "approximate",
  accountId: "bank",
  categoryId: "energy",
  tagIds: [],
  notes: "",
  recurrenceId: null,
  startDate: "2025-01-15",
  endDate: null,
  frequency: "monthly",
  active: true,
};
function ledger(): Ledger {
  const l = {
    ...emptyLedger(),
    accounts: [{ id: "bank", name: "Banco" }],
    categories: [{ id: "energy", name: "Energia" }],
    recurrences: [rule],
  };
  for (let i = 0; i < 12; i++)
    l.transactions.push(
      transactionSchema.parse({
        id: `bill:${i}`,
        accountId: "bank",
        categoryId: "energy",
        description: "Energia",
        date: `${shiftMonth("2025-01", i)}-15`,
        amount: -12000,
        tagIds: [],
        recurrenceId: "energy",
        validationStatus: "confirmed",
      }),
    );
  return l;
}
describe("shared statistical engine", () => {
  it("evaluates each horizon from its own past without selecting on the target observation", () => {
    const series = [
      10000, 10000, 13000, 14000, 16000, 15000, 18000, 20000, 25000, 22000,
      21000, 26000, 90000, 25000,
    ];
    for (const h of [1, 2, 6]) {
      const f = forecastSeries(series, h);
      expect(f.horizon).toBe(h);
      for (const e of f.errors) {
        const prefix = series.slice(0, e.targetIndex - h + 1);
        expect(e.predicted).toBe(forecastSeries(prefix, h).expected);
        expect(e.error).toBe(series[e.targetIndex] - e.predicted);
      }
    }
    expect(forecastSeries(series, 20).low).toBeNull();
  });
  it("keeps finite samples visible and refuses manufactured percentage margins", () => {
    expect(forecastSeries(Array(12).fill(10000))).toMatchObject({
      low: 10000,
      high: 10000,
      mae: 0,
    });
    expect(forecastSeries([10000, 10000, 10000, 10000])).toMatchObject({
      low: null,
      high: null,
      rangeAvailable: false,
    });
  });
  it("updates the probability of intermittent spending during months with no activity", () => {
    const before = intermittentState([10000, 0, 10000, 0, 10000]);
    const after = intermittentState([10000, 0, 10000, 0, 10000, 0, 0, 0]);
    expect(after.probability).toBeLessThan(before.probability);
    expect(after.size).toBe(before.size);
    expect(forecastSeries([0, 0, 0, 0, 500000, 0, 0, 0]).supported).toBe(false);
  });
  it("aggregates paired scenarios and retains negative correlation instead of adding upper quantiles", () => {
    const a = empiricalDistribution(
      100,
      Array.from({ length: 10 }, (_, i) => ({
        month: String(i),
        amount: i * 20,
      })),
    );
    const b = empiricalDistribution(
      100,
      Array.from({ length: 10 }, (_, i) => ({
        month: String(i),
        amount: 200 - i * 20,
      })),
    );
    const sum = combineDistributions([a, b, fixedDistribution(50)]);
    expect(sum).toMatchObject({ expected: 250, low: 250, high: 250 });
    expect(sum.high).toBeLessThan(a.high! + b.high! + 50);
    expect(
      combineDistributions([a, empiricalDistribution(100, [])]),
    ).toMatchObject({ low: null, high: null });
  });
  it("uses validated approximate recurrence amounts, respects exact amounts and excludes pending/future training", () => {
    const l = ledger(),
      before = structuredClone(l);
    expect(
      recurringAmount(rule, l, "2026-01", "2026-02-15", new Map()).expected,
    ).toBe(12000);
    l.transactions.push(
      transactionSchema.parse({
        id: "pending",
        accountId: "bank",
        categoryId: "energy",
        description: "Energia",
        date: "2025-12-20",
        amount: -900000,
        tagIds: [],
        recurrenceId: "energy",
        validationStatus: "pending",
      }),
    );
    l.transactions.push(
      transactionSchema.parse({
        id: "future",
        accountId: "bank",
        categoryId: "energy",
        description: "Energia",
        date: "2027-01-15",
        amount: -900000,
        tagIds: [],
        recurrenceId: "energy",
      }),
    );
    expect(
      recurringAmount(rule, l, "2026-01", "2026-02-15", new Map()).expected,
    ).toBe(12000);
    expect(
      recurringAmount(
        { ...rule, amountMode: "exact" },
        l,
        "2026-01",
        "2026-02-15",
        new Map(),
      ),
    ).toMatchObject({ expected: 10000, low: 10000, high: 10000 });
    expect(before.transactions.every((t) => t.amount === -12000)).toBe(true);
  });
  it("has exact schedule estimates without history and stops on the last installment", () => {
    const l = ledger();
    l.transactions = [];
    l.recurrences = [
      {
        ...rule,
        startDate: "2026-01-15",
        amountMode: "exact",
        installmentCount: 2,
      },
    ];
    const engine = new CashflowForecast(l, "2026-01");
    expect(engine.month("2026-02").expense).toMatchObject({
      expected: 10000,
      scheduled: 10000,
      low: 10000,
      high: 10000,
    });
    expect(engine.month("2026-03").expense.scheduled).toBe(0);
  });
  it("pending inferred patterns replace the hypothesis rather than adding a second copy", () => {
    const l = ledger();
    l.recurrences = [];
    l.transactions.forEach((t) => (t.recurrenceId = null));
    l.transactions.push(
      transactionSchema.parse({
        id: "pending",
        accountId: "bank",
        categoryId: "energy",
        description: "Energia",
        date: "2026-02-15",
        amount: -13000,
        tagIds: [],
        validationStatus: "pending",
      }),
    );
    expect(
      new CashflowForecast(l, "2026-01").month("2026-02").expense.expected,
    ).toBe(13000);
  });
  it("learns only from comparable forecasts saved before the outcome, never from category limits", () => {
    const l = ledger();
    l.recurrences = [];
    const config = {
      month: "2026-02",
      accountIds: ["bank"],
      savingsBps: 2000,
      incomeOverride: 100000,
      categories: [{ categoryId: "energy", reserveBps: 10000 }],
    };
    const base = proposePlan(l, config, "2026-01-01");
    l.monthlyPlans = [];
    for (let i = 0; i < 6; i++) {
      const target = shiftMonth("2025-07", i),
        anchor = shiftMonth(target, -1);
      const p = savePlanRecord(
        l,
        {
          ...base,
          config: { ...config, month: target },
          forecast: {
            version: FORECAST_VERSION,
            anchor,
            horizon: 2,
            recurrences: recurrenceSignature(l),
            income: 0,
            categories: [{ categoryId: "energy", expected: 10000 }],
          },
        },
        `${anchor}-15`,
      );
      p.allocations[0].allocated = 1;
      l.monthlyPlans.push(p);
    }
    closeExpiredPlans(l, "2026-01-01");
    expect(forecastFeedback(l, "2026-01", 2, "energy")).toEqual({
      adjustment: 2000,
      months: 6,
      applied: true,
    });
    expect(forecastFeedback(l, "2026-01", 1, "energy").applied).toBe(false);
    const results = structuredClone(l.planResults!);
    for (const invalid of [
      "scope",
      "pending",
      "version",
      "late",
      "recurrence",
    ]) {
      l.planResults = structuredClone(results);
      for (const r of l.planResults) {
        if (invalid === "scope") r.plan.config.accountIds = ["other"];
        if (invalid === "pending") r.actual.pendingCount = 1;
        if (invalid === "version") r.plan.forecast!.version = "old";
        if (invalid === "late") r.plan.createdAt = `${r.plan.config.month}-10`;
        if (invalid === "recurrence")
          r.plan.forecast!.recurrences = "different";
      }
      expect(forecastFeedback(l, "2026-01", 2, "energy").applied).toBe(false);
    }
  });
});
