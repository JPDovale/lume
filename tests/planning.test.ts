import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  transactionSchema,
  type Ledger,
} from "../src/domain/model";
import {
  allocateBudget,
  allocateReserves,
  percentOf,
} from "../src/domain/planning-allocation";
import {
  proposePlan,
  savePlanRecord,
  closeExpiredPlans,
  measurePlan,
  suggestPlanConfig,
} from "../src/domain/planning";
import {
  planConfigSchema,
  type PlanConfig,
} from "../src/domain/planning-model";
import { PlanningService } from "../src/application/planning-service";
import { LedgerService } from "../src/application/ledger-service";
function fixture() {
  const ledger: Ledger = {
    ...emptyLedger(),
    accounts: [
      { id: "bank", name: "Banco" },
      { id: "invest", name: "Investimentos" },
    ],
    categories: [
      { id: "food", name: "Alimentação" },
      { id: "home", name: "Casa" },
      { id: "extra", name: "Extra" },
    ],
  };
  for (let m = 1; m <= 8; m++)
    for (const [categoryId, amount] of [
      [null, 500000],
      ["food", -100000],
      ["home", -200000],
    ] as const)
      ledger.transactions.push(
        transactionSchema.parse({
          id: `${m}:${categoryId}`,
          accountId: "bank",
          description: categoryId ?? "Salário",
          date: `2026-${String(m).padStart(2, "0")}-05`,
          categoryId,
          amount,
          tagIds: [],
        }),
      );
  return ledger;
}
const config = (): PlanConfig => ({
  month: "2026-09",
  accountIds: ["bank"],
  savingsBps: 2000,
  incomeOverride: null,
  categories: [
    { categoryId: "food", reserveBps: 10000 },
    { categoryId: "home", reserveBps: 10000 },
  ],
});
const total = (p: ReturnType<typeof proposePlan>) =>
  p.allocations.reduce((s, c) => s + c.allocated, 0);
describe("monthly allocation", () => {
  it("conserves every cent, including large safe amounts and equal remainders", () => {
    expect(
      allocateBudget(101, [
        { weight: 1, floor: 0 },
        { weight: 1, floor: 0 },
        { weight: 1, floor: 0 },
      ]),
    ).toEqual([34, 34, 33]);
    for (const budget of [0, 1, 99, 99999, Number.MAX_SAFE_INTEGER]) {
      const amounts = allocateBudget(budget, [
        { weight: 3, floor: 0 },
        { weight: 7, floor: 0 },
      ]);
      expect(amounts.reduce((s, v) => s + v, 0)).toBe(budget);
      expect(amounts.every(Number.isSafeInteger)).toBe(true);
    }
    expect(percentOf(101, 5000)).toBe(51);
  });
  it("preserves commitments, redistributes residual and exposes infeasible budgets", () => {
    expect(
      allocateBudget(100, [
        { weight: 1, floor: 80 },
        { weight: 9, floor: 0 },
      ]),
    ).toEqual([80, 20]);
    expect(
      allocateBudget(50, [
        { weight: 1, floor: 80 },
        { weight: 9, floor: 10 },
      ]),
    ).toEqual([80, 10]);
    expect(
      allocateBudget(5, [
        { weight: 0, floor: 0 },
        { weight: 0, floor: 0 },
      ]),
    ).toEqual([3, 2]);
    expect(allocateBudget(100, [])).toEqual([]);
  });
  it("uses historical income and category shares with a user savings target", () => {
    const p = proposePlan(fixture(), config(), "2026-09-19");
    expect(p.income).toBe(500000);
    expect(p.savingsGoal).toBe(100000);
    expect(total(p)).toBe(300000);
    expect(p.allocations.map((c) => c.allocated)).toEqual([100000, 200000]);
    expect(p.unallocated).toBe(100000);
  });
  it("reserves exactly 0, 50 and 100 percent without inflating other categories or changing the forecast", () => {
    const ledger = fixture(),
      c = config();
    const original = proposePlan(ledger, c, "2026-09-19");
    for (const reserveBps of [0, 5000, 10000]) {
      c.categories[0].reserveBps = reserveBps;
      const plan = proposePlan(ledger, c, "2026-09-19");
      expect(plan.allocations[0].allocated).toBe(reserveBps * 10);
      expect(plan.allocations[0].requested).toBe(reserveBps * 10);
      expect(plan.allocations[1].allocated).toBe(200000);
      expect(plan.forecast).toEqual(original.forecast);
      expect(total(plan) + plan.unallocated).toBe(plan.spendingBudget);
    }
  });
  it("redistributes scarce funds above commitments and reports requested versus allocated amounts", () => {
    const ledger = fixture(),
      c = config();
    c.savingsBps = 6000;
    c.categories[0].reserveBps = 0;
    const before = proposePlan(ledger, c, "2026-09-19");
    expect(before.allocations.map((a) => a.allocated)).toEqual([0, 200000]);
    c.categories[0].reserveBps = 10000;
    const after = proposePlan(ledger, c, "2026-09-19");
    expect(after.allocations.map((a) => a.allocated)).toEqual([66667, 133333]);
    expect(after.allocations.map((a) => a.requested)).toEqual([100000, 200000]);
    expect(after.alerts.some((a) => a.id === "reserves-adjusted")).toBe(true);
    expect(total(after)).toBe(200000);
  });
  it("keeps floors at zero percent, caps at the requested amount and conserves cents when constrained", () => {
    const items = [
      { requested: 0, committed: 80 },
      { requested: 200, committed: 10 },
    ];
    expect(allocateReserves(300, items)).toEqual([80, 200]);
    expect(allocateReserves(200, items)).toEqual([80, 120]);
    expect(allocateReserves(50, items)).toEqual([80, 10]);
    expect(allocateReserves(200, [{ requested: 0, committed: 0 }])).toEqual([
      0,
    ]);
    expect(allocateReserves(200, [])).toEqual([]);
    expect(
      allocateReserves(101, [
        { requested: 100, committed: 10 },
        { requested: 100, committed: 10 },
      ]),
    ).toEqual([51, 50]);
    expect(
      allocateReserves(Number.MAX_SAFE_INTEGER, [
        { requested: Number.MAX_SAFE_INTEGER, committed: 1 },
      ]),
    ).toEqual([Number.MAX_SAFE_INTEGER]);
  });
  it("adds new categories, removes categories and supports no history/manual income", () => {
    const l = fixture(),
      c = config();
    c.categories.push({ categoryId: "extra", reserveBps: 10000 });
    const p = proposePlan(l, c, "2026-09-19");
    expect(p.allocations[2].seeded).toBe(true);
    expect(p.allocations[2].allocated).toBe(0);
    expect(total(p)).toBe(300000);
    c.categories = [c.categories[0]];
    expect(proposePlan(l, c, "2026-09-19").allocations[0].allocated).toBe(
      100000,
    );
    l.transactions = [];
    c.incomeOverride = 10001;
    expect(total(proposePlan(l, c, "2026-09-19"))).toBe(0);
    expect(proposePlan(l, c, "2026-09-19").unallocated).toBe(8001);
    c.savingsBps = 10000;
    expect(total(proposePlan(l, c, "2026-09-19"))).toBe(0);
  });
  it("deducts excluded commitments and warns when the savings goal cannot fit", () => {
    const l = fixture();
    l.transactions.push(
      transactionSchema.parse({
        id: "extra",
        accountId: "bank",
        description: "Compra",
        categoryId: "extra",
        date: "2026-09-01",
        amount: -450000,
        tagIds: [],
      }),
    );
    const p = proposePlan(l, config(), "2026-09-19");
    expect(p.outsideCommitted).toBe(450000);
    expect(total(p)).toBe(0);
    expect(p.alerts.some((a) => a.id === "commitments")).toBe(true);
  });
  it("ignores investments, transfers and opening balances in actual results", () => {
    const l = fixture();
    for (const [id, accountId, transfer, openingBalance] of [
      ["invest", "invest", false, false],
      ["transfer", "bank", true, false],
      ["opening", "bank", false, true],
    ] as const)
      l.transactions.push(
        transactionSchema.parse({
          id,
          accountId,
          transfer,
          openingBalance,
          description: id,
          date: "2026-09-01",
          categoryId: null,
          amount: 9999999,
          tagIds: [],
        }),
      );
    expect(
      measurePlan(proposePlan(l, config(), "2026-09-19"), l, "2026-09-19")
        .income,
    ).toBe(0);
  });
});
describe("planning lifecycle", () => {
  function setup() {
    let state = fixture(),
      today = "2026-08-19";
    const repo = {
      read: () => structuredClone(state),
      save: (l: Ledger) => {
        state = structuredClone(l);
      },
    };
    const clock = { today: () => today };
    return {
      repo,
      planning: new PlanningService(repo, clock),
      service: new LedgerService(repo, clock),
      advance: () => {
        today = "2026-10-02";
      },
    };
  }
  it("validates month, references and duplicate selections before persisting", () => {
    const { planning, repo } = setup();
    for (const patch of [
      { month: "2026-08" },
      { month: "2027-10" },
      { accountIds: ["missing"] },
      { accountIds: ["bank", "bank"] },
      { categories: [{ categoryId: "missing", reserveBps: 10000 }] },
      ...[-1, 10001, 0.5, Number.NaN].map((reserveBps) => ({
        categories: [{ categoryId: "food", reserveBps }],
      })),
      {
        categories: [
          { categoryId: "food", reserveBps: 10000 },
          { categoryId: "food", reserveBps: 5000 },
        ],
      },
    ])
      expect(() => planning.save({ ...config(), ...patch })).toThrow();
    expect(repo.read().monthlyPlans).toBeUndefined();
  });
  it("saves a plan, closes once on next startup, and preserves the frozen plan on late edits", () => {
    const { planning, repo, service, advance } = setup();
    planning.save(config());
    const frozen = repo.read().monthlyPlans![0];
    advance();
    const first = service.snapshot();
    expect(first.planResults).toHaveLength(1);
    expect(first.planResults![0].revision).toBe(1);
    expect(service.snapshot().planResults).toEqual(first.planResults);
    const l = repo.read();
    l.transactions.push(
      transactionSchema.parse({
        id: "late",
        accountId: "bank",
        description: "Atrasado",
        categoryId: "extra",
        date: "2026-09-20",
        amount: -5000,
        tagIds: [],
        validationStatus: "pending",
      }),
    );
    repo.save(l);
    let result = service.snapshot().planResults![0];
    expect(result.actual.pendingCount).toBe(1);
    expect(result.actual.expense).toBe(0);
    const next = repo.read();
    next.transactions.find((t) => t.id === "late")!.validationStatus =
      "confirmed";
    repo.save(next);
    result = service.snapshot().planResults![0];
    expect(result.revision).toBe(3);
    expect(result.plan).toEqual(frozen);
    expect(result.actual.expense).toBe(5000);
    expect(
      result.actual.categories.find((c) => c.categoryId === "extra")?.included,
    ).toBe(false);
  });
  it("merges current category budgets on deletion while preserving the total", () => {
    const { planning, service, repo } = setup();
    planning.save(config());
    service.deleteNamed("categories", "food", "home");
    const p = repo.read().monthlyPlans![0];
    expect(p.allocations).toHaveLength(1);
    expect(p.allocations[0].allocated).toBe(300000);
    expect(p.config.categories).toEqual([
      { categoryId: "home", reserveBps: 10000 },
    ]);
  });
  it("combines reserve percentages using the categories' forecast amounts on migration", () => {
    const { planning, service, repo } = setup();
    const c = config();
    c.categories[0].reserveBps = 2500;
    c.categories[1].reserveBps = 7500;
    planning.save(c);
    service.deleteNamed("categories", "food", "home");
    const merged = repo.read().monthlyPlans![0];
    expect(merged.allocations[0].requested).toBe(175000);
    expect(merged.allocations[0].allocated).toBe(175000);
    expect(merged.config.categories[0].reserveBps).toBe(5833);
  });
  it("opens legacy priorities as a full forecast proposal without rewriting saved or closed history", () => {
    const ledger = fixture();
    const plan = savePlanRecord(
      ledger,
      proposePlan(ledger, config(), "2026-08-19"),
      "2026-08-19",
    );
    const legacy = JSON.parse(JSON.stringify(plan));
    for (const category of legacy.config.categories) {
      delete category.reserveBps;
      category.priority = 3;
    }
    for (const allocation of legacy.allocations) {
      delete allocation.reserveBps;
      delete allocation.requested;
      allocation.priority = 3;
    }
    ledger.monthlyPlans = [legacy];
    const frozen = structuredClone(legacy);
    expect(planConfigSchema.parse(legacy.config).categories[0].reserveBps).toBe(
      10000,
    );
    closeExpiredPlans(ledger, "2026-10-01");
    expect(
      suggestPlanConfig(ledger, "2026-11", ["bank"], "2026-10-01").categories[0]
        .reserveBps,
    ).toBe(10000);
    expect(ledger.monthlyPlans[0]).toEqual(frozen);
    expect(ledger.planResults![0].plan).toEqual(frozen);
  });
  it("learns only from completed matching-scope results and keeps the prior savings preference", () => {
    const l = fixture();
    for (const month of ["2026-07", "2026-08"]) {
      const c = { ...config(), month, savingsBps: 2500 };
      l.monthlyPlans ??= [];
      l.monthlyPlans.push(
        savePlanRecord(l, proposePlan(l, c, `${month}-01`), `${month}-01`),
      );
    }
    closeExpiredPlans(l, "2026-09-01");
    const base = proposePlan(l, config(), "2026-09-19");
    expect(base.allocations[0].learnedMonths).toBe(0); // Plans saved during their target month are not honest forecast observations.
    expect(
      suggestPlanConfig(l, "2026-09", ["bank"], "2026-09-19").savingsBps,
    ).toBe(2500);
    l.planResults![0].actual.pendingCount = 1;
    expect(
      proposePlan(l, config(), "2026-09-19").allocations[0].learnedMonths,
    ).toBe(0);
  });
});

describe("feedback boundaries", () => {
  it("does not use budget targets or legacy in-month plans to alter the forecast", () => {
    const ledger = fixture(),
      initial = proposePlan(ledger, config(), "2026-09-19");
    for (const month of ["2026-07", "2026-08"]) {
      const plan = savePlanRecord(
        ledger,
        proposePlan(ledger, { ...config(), month }, `${month}-01`),
        `${month}-01`,
      );
      plan.allocations[0].allocated = 1;
      ledger.monthlyPlans ??= [];
      ledger.monthlyPlans.push(plan);
    }
    closeExpiredPlans(ledger, "2026-09-01");
    expect(proposePlan(ledger, config(), "2026-09-19").allocations).toEqual(
      initial.allocations,
    );
  });
  it("requires migration for a category used only in an open plan", () => {
    let state = fixture();
    state.transactions = [];
    const repo = {
      read: () => structuredClone(state),
      save: (next: Ledger) => {
        state = structuredClone(next);
      },
    };
    const clock = { today: () => "2026-08-19" };
    new PlanningService(repo, clock).save({
      ...config(),
      incomeOverride: 500000,
    });
    const service = new LedgerService(repo, clock);
    expect(() => service.deleteNamed("categories", "food")).toThrow("destino");
    expect(repo.read().categories).toHaveLength(3);
  });
});
