import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  type Ledger,
  type Transaction,
  type Recurrence,
} from "../src/domain/model";
import { CashflowForecast } from "../src/domain/analytics/forecast";
import { spendingAnalysis } from "../src/domain/analytics/spending";
import { netWorthAnalysis } from "../src/domain/analytics/net-worth";
import { detectMonthlyPatterns } from "../src/domain/analytics/patterns";
import { estimateSeries } from "../src/domain/analytics/statistics";
const tx = (
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  date,
  amount,
  accountId: "bank",
  description: id,
  categoryId: "food",
  tagIds: [],
  notes: "",
  recurrenceId: null,
  transfer: false,
  openingBalance: false,
  ...extra,
});
const ledger = (
  transactions: Transaction[] = [],
  recurrences: Recurrence[] = [],
): Ledger => ({
  ...emptyLedger(),
  accounts: [
    { id: "bank", name: "Banco" },
    { id: "credit", name: "Cartão" },
  ],
  categories: [
    { id: "food", name: "Alimentação" },
    { id: "home", name: "Moradia" },
  ],
  transactions,
  recurrences,
});
const rent: Recurrence = {
  id: "rent",
  description: "Aluguel",
  accountId: "bank",
  categoryId: "home",
  tagIds: [],
  amount: -100000,
  notes: "",
  recurrenceId: null,
  startDate: "2026-01-10",
  endDate: null,
  frequency: "monthly",
  active: true,
};
const history = () => [
  tx("seed", "2026-01-15", -1000),
  tx("feb", "2026-02-15", -10000),
  tx("mar", "2026-03-15", -10000),
];
describe("category comparisons", () => {
  it("compares equivalent elapsed days, excludes future postings, transfers and initial balances", () => {
    const s = ledger([
      tx("past-early", "2026-08-05", -10000),
      tx("past-late", "2026-08-25", -90000),
      tx("now", "2026-09-10", -20000),
      tx("future", "2026-09-25", -100000),
      tx("transfer", "2026-09-10", -50000, { transfer: true }),
      tx("opening", "2026-09-10", -50000, { openingBalance: true }),
    ]);
    const r = spendingAnalysis(s, "2026-09-18");
    expect(r.actual).toBe(20000);
    expect(r.previous).toBe(10000);
    expect(r.change).toBe(100);
    expect(r.categories[0].count).toBe(1);
    expect(r.insights[0].categoryId).toBe("food");
  });
  it("clamps the comparison day for February", () =>
    expect(spendingAnalysis(ledger(), "2024-03-31").priorCutoff).toBe(
      "2024-02-29",
    ));
  it("flags an unusually large transaction using historical median", () => {
    const s = ledger([
      ...Array.from({ length: 6 }, (_, i) =>
        tx(`p${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`, -1000),
      ),
      tx("unusual", "2026-09-10", -50000),
      tx("seed", "2026-07-02", -1000),
    ]);
    expect(
      spendingAnalysis(s, "2026-09-18").insights.some(
        (i) => i.id === "outlier:food",
      ),
    ).toBe(true);
  });
  it("retains uncategorized spending rather than losing it from totals", () => {
    const r = spendingAnalysis(
      ledger([tx("unassigned", "2026-09-01", -2500, { categoryId: null })]),
      "2026-09-18",
    );
    expect(r.categories[0].name).toBe("Sem categoria");
    expect(r.categories[0].share).toBe(100);
  });
});
describe("monthly pattern detection", () => {
  const subscription = () =>
    [1, 2, 3].map((month) =>
      tx(`net-${month}`, `2026-0${month}-10`, -10000, {
        description: "Internet",
        categoryId: "home",
      }),
    );
  it("requires consecutive months, stable amounts, matching category and close dates", () => {
    expect(
      detectMonthlyPatterns(ledger(subscription()), "2026-04"),
    ).toHaveLength(1);
    expect(
      detectMonthlyPatterns(ledger(subscription().slice(0, 2)), "2026-04"),
    ).toHaveLength(0);
    expect(
      detectMonthlyPatterns(
        ledger(
          subscription().map((t, i) =>
            i === 1 ? { ...t, date: "2026-02-27" } : t,
          ),
        ),
        "2026-04",
      ),
    ).toHaveLength(0);
    expect(
      detectMonthlyPatterns(ledger(subscription()), "2026-05"),
    ).toHaveLength(0);
    expect(
      detectMonthlyPatterns(
        ledger([
          ...subscription(),
          tx("extra", "2026-03-14", -10000, {
            description: "Internet",
            categoryId: "home",
          }),
        ]),
        "2026-04",
      ),
    ).toHaveLength(0);
  });
  it("does not infer a second recurrence for an existing or paused native rule", () => {
    const rule = {
      ...rent,
      description: "Internet",
      amount: -10000,
      active: false,
    };
    expect(
      detectMonthlyPatterns(ledger(subscription(), [rule]), "2026-04"),
    ).toHaveLength(0);
  });
  it("excludes future data from historical inference", () =>
    expect(
      detectMonthlyPatterns(ledger(subscription()), "2026-03"),
    ).toHaveLength(0));
});
describe("forecast accounting", () => {
  it("uses known variable spending as a floor instead of adding it to the baseline", () => {
    const model = new CashflowForecast(
      ledger([...history(), tx("planned", "2026-05-20", -4000)]),
      "2026-04",
    );
    expect(model.month("2026-05").expense.expected).toBe(10000);
    expect(model.month("2026-05").expense.known).toBe(4000);
    const large = new CashflowForecast(
      ledger([...history(), tx("planned", "2026-05-20", -15000)]),
      "2026-04",
    );
    expect(large.month("2026-05").expense.expected).toBe(15000);
    expect(large.month("2026-05").expense.low).toBe(15000);
  });
  it("replaces a historical native merchant pattern rather than double counting it", () => {
    const s = ledger(
      [
        ...history(),
        ...[1, 2, 3].map((m) =>
          tx(`rent-${m}`, `2026-0${m}-10`, -100000, {
            description: "Aluguel",
            categoryId: "home",
          }),
        ),
      ],
      [rent],
    );
    const r = new CashflowForecast(s, "2026-04").month("2026-05");
    expect(r.expense.expected).toBe(110000);
    expect(r.expense.scheduled).toBe(100000);
    expect(r.expense.detected).toBe(0);
  });
  it("deduplicates imported and generated occurrences on the same date, preserving actual amounts", () => {
    const s = ledger(
      [
        ...history(),
        tx("import-rent", "2026-05-10", -110000, {
          description: "Aluguel",
          categoryId: "home",
        }),
      ],
      [rent],
    );
    const r = new CashflowForecast(s, "2026-04").month("2026-05");
    expect(r.expense.expected).toBe(120000);
    expect(r.expense.scheduled).toBe(0);
  });
  it("counts an inferred pattern only once when a future posting already exists", () => {
    const rows = [1, 2, 3].map((m) =>
      tx(`net-${m}`, `2026-0${m}-10`, -10000, {
        description: "Internet",
        categoryId: "home",
      }),
    );
    const model = new CashflowForecast(
      ledger([
        ...rows,
        tx("planned-net", "2026-05-12", -11000, {
          description: "Internet",
          categoryId: "home",
        }),
      ]),
      "2026-04",
    );
    const future = model.month("2026-05");
    expect(future.expense.expected).toBe(11000);
    expect(future.expense.detected).toBe(11000);
    expect(model.month("2026-06").expense.expected).toBe(10000);
  });
  it("shows no forecast when there is only one completed reference month", () => {
    const r = new CashflowForecast(
      ledger(history().slice(0, 2)),
      "2026-03",
    ).month("2026-04");
    expect(r.expense.expected).toBeNull();
    expect(r.expense.quality).toBe("Sem base");
  });
  it("keeps zero-spend months in the estimate and caps long-range trends", () => {
    const model = new CashflowForecast(
      ledger([tx("seed", "2026-01-02", -1), tx("only", "2026-02-02", -9000)]),
      "2026-04",
    );
    expect(model.month("2026-05").expense.expected).toBe(3000);
    const modelValue = estimateSeries([100, 200, 300, 400], 12);
    expect(modelValue.level).toBe(300);
    expect(modelValue.trend).toBe(75);
  });
  it("category forecasts reconcile exactly to the total at each horizon", () => {
    const model = new CashflowForecast(ledger(history(), [rent]), "2026-04");
    for (const month of ["2026-04", "2026-05", "2027-03"]) {
      const r = model.month(month);
      expect(r.expense.expected).toBe(
        r.categories.reduce((sum, c) => sum + c.expected!, 0),
      );
      expect(r.expense.low!).toBeLessThanOrEqual(r.expense.expected!);
      expect(r.expense.high!).toBeGreaterThanOrEqual(r.expense.expected!);
    }
  });
});
describe("net worth", () => {
  it("carries balances from before the visible window and subtracts liabilities", () => {
    const s = ledger([
      tx("opening", "2025-01-01", 100000, { openingBalance: true }),
      tx("debt", "2025-01-01", -30000, {
        openingBalance: true,
        accountId: "credit",
      }),
      tx("income", "2026-03-01", 20000),
      tx("purchase", "2026-03-05", -5000),
    ]);
    const r = netWorthAnalysis(s, "2026-04-10", 3);
    expect(r.opening).toBe(70000);
    expect(r.worth).toBe(85000);
    expect(r.assets).toBe(115000);
    expect(r.liabilities).toBe(30000);
    expect(r.history.map((p) => p.netWorth)).toEqual([70000, 85000, 85000]);
    expect(r.savings).toBe(15000);
    expect(r.adjustments).toBe(0);
  });
  it("does not treat initial balances and internal transfers as new savings", () => {
    const s = ledger([
      tx("opening", "2026-03-01", 100000, { openingBalance: true }),
      tx("out", "2026-03-02", -20000, { transfer: true }),
      tx("in", "2026-03-02", 20000, { transfer: true, accountId: "credit" }),
    ]);
    const r = netWorthAnalysis(s, "2026-04-10", 3);
    expect(r.worth).toBe(100000);
    expect(r.savings).toBe(0);
    expect(r.adjustments).toBe(100000);
    expect(r.savingRate).toBeNull();
    expect(r.history[0].netWorth).toBeNull();
  });
  it("does not include future transactions in the observed net worth", () => {
    const r = netWorthAnalysis(
      ledger([
        tx("opening", "2026-03-01", 100000, { openingBalance: true }),
        tx("future", "2026-05-01", -90000),
      ]),
      "2026-04-10",
    );
    expect(r.worth).toBe(100000);
  });
  it("accounts for only the remaining current-month income and expenses before future months", () => {
    const rows = [1, 2, 3, 4].flatMap((m) => [
      tx(`salary-${m}`, `2026-0${m}-05`, 100000, {
        description: "Salário",
        categoryId: null,
      }),
      tx(`food-${m}`, `2026-0${m}-06`, -20000),
    ]);
    const r = netWorthAnalysis(ledger(rows), "2026-04-10", 6, 3);
    expect(r.worth).toBe(320000);
    expect(r.projection[0].expected).toBe(320000);
    expect(r.projection[1].expected).toBe(400000);
    expect(r.projection.at(-1)?.expected).toBe(560000);
  });
  it("reconciles movements and negative net worth without a false growth percentage", () => {
    const r = netWorthAnalysis(
      ledger([
        tx("debt", "2026-03-01", -100000, {
          openingBalance: true,
          accountId: "credit",
        }),
        tx("salary", "2026-03-02", 20000),
        tx("spend", "2026-03-03", -30000),
      ]),
      "2026-04-10",
      3,
    );
    expect(r.worth).toBe(-110000);
    expect(r.savingRate).toBe(-50);
    expect(
      r.opening + r.income - r.expenses + r.adjustments + r.transferImpact,
    ).toBe(r.worth);
  });
});
