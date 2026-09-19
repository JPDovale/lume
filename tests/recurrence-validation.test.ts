import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  recurrenceSchema,
  type Ledger,
  type Recurrence,
} from "../src/domain/model";
import {
  occurrences,
  occurrenceDate,
  installmentTotal,
  installmentLabel,
} from "../src/domain/recurrence";
import { LedgerService } from "../src/application/ledger-service";
import { CashflowForecast } from "../src/domain/analytics/forecast";
import { netWorthAnalysis } from "../src/domain/analytics/net-worth";
import { spendingAnalysis } from "../src/domain/analytics/spending";
import { report } from "../src/domain/reports";
import { SqliteLedgerRepository } from "../src/infrastructure/sqlite-repository";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const rule: Recurrence = {
  id: "energy",
  description: "Energia",
  accountId: "bank",
  amount: -15000,
  categoryId: null,
  tagIds: [],
  notes: "",
  recurrenceId: null,
  startDate: "2024-01-31",
  endDate: null,
  frequency: "monthly",
  active: true,
  installmentCount: 3,
  amountMode: "approximate",
};
function setup(initial?: Ledger, today = "2024-02-29") {
  let state = initial ?? {
    ...emptyLedger(),
    accounts: [{ id: "bank", name: "Banco" }],
  };
  const repository = {
    read: () => structuredClone(state),
    save: (s: Ledger) => {
      state = structuredClone(s);
    },
  };
  return {
    repository,
    service: new LedgerService(repository, { today: () => today }),
  };
}
describe("installment schedules", () => {
  it("limits generation by count and restores month-end dates", () => {
    const rows = occurrences(rule, "2024-01-01", "2025-12-31");
    expect(rows.map((t) => [t.date, installmentLabel(t)])).toEqual([
      ["2024-01-31", "1/3"],
      ["2024-02-29", "2/3"],
      ["2024-03-31", "3/3"],
    ]);
    expect(
      rows.every(
        (t) => t.recurrenceId === rule.id && t.validationStatus === "pending",
      ),
    ).toBe(true);
  });
  it("counts date-bounded monthly, weekly and leap-year schedules inclusively", () => {
    expect(
      installmentTotal({
        ...rule,
        installmentCount: null,
        endDate: "2024-03-30",
      }),
    ).toBe(2);
    expect(
      installmentTotal({
        ...rule,
        installmentCount: null,
        endDate: "2024-03-31",
      }),
    ).toBe(3);
    const annual = {
      ...rule,
      frequency: "yearly" as const,
      startDate: "2024-02-29",
      installmentCount: null,
      endDate: "2028-02-29",
    };
    expect(installmentTotal(annual)).toBe(5);
    expect(occurrenceDate(annual, 1)).toBe("2025-02-28");
    expect(
      installmentTotal({
        ...rule,
        frequency: "weekly",
        installmentCount: null,
        endDate: "2024-02-14",
      }),
    ).toBe(3);
    expect(installmentTotal({ ...rule, installmentCount: null })).toBeNull();
  });
  it("validates count and mutually exclusive ending modes", () => {
    for (const count of [0, -1, 1.5, 1201])
      expect(
        recurrenceSchema.safeParse({ ...rule, installmentCount: count })
          .success,
      ).toBe(false);
    expect(
      recurrenceSchema.safeParse({ ...rule, endDate: "2024-04-01" }).success,
    ).toBe(false);
    expect(
      occurrences({ ...rule, installmentCount: 1 }, "2024-01-01", "2030-01-01"),
    ).toHaveLength(1);
  });
});
describe("linked pending transactions", () => {
  it("keeps origin and numbering immutable when changing date/value and validating", () => {
    const { service, repository } = setup();
    const pending = service.saveRecurrence(rule).transactions[0];
    const edited = service.saveTransaction({
      ...pending,
      date: "2024-02-01",
      amount: -16342,
      recurrenceId: null,
      installmentNumber: 99,
      recurrenceDate: "2020-01-01",
    });
    expect(edited.transactions[0]).toMatchObject({
      recurrenceId: rule.id,
      installmentNumber: 1,
      recurrenceDate: "2024-01-31",
      validationStatus: "pending",
      amount: -16342,
    });
    const confirmed = service.saveTransaction({
      ...edited.transactions[0],
      validationStatus: "confirmed",
    });
    expect(confirmed.transactions[0].validationStatus).toBe("confirmed");
    expect(
      new LedgerService(repository, { today: () => "2024-04-30" }).snapshot()
        .transactions,
    ).toHaveLength(3);
    expect(service.snapshot().transactions[0].amount).toBe(-16342);
    expect(service.snapshot().recurrences[0].amount).toBe(-15000);
    expect(() =>
      service.saveTransaction({ ...pending, recurrenceId: "another" }),
    ).toThrow("origem");
    expect(() => service.saveTransaction({ ...pending, id: "forged" })).toThrow(
      "gerados",
    );
  });
  it("keeps estimates out of actual spending and worth, but counts them once in forecasts even while paused", () => {
    const { service } = setup();
    const state = service.saveRecurrence(rule);
    const paused = service.saveRecurrence({ ...rule, active: false });
    expect(spendingAnalysis(state, "2024-02-29").actual).toBe(0);
    expect(netWorthAnalysis(state, "2024-02-29").worth).toBe(0);
    expect(report(state, "2024-02-29").balance).toBe(0);
    expect(
      new CashflowForecast(paused, "2024-02").month("2024-02").expense,
    ).toMatchObject({ known: 0, scheduled: 15000 });
    const february = state.transactions[1];
    const validated = service.saveTransaction({
      ...february,
      amount: -16234,
      validationStatus: "confirmed",
    });
    expect(spendingAnalysis(validated, "2024-02-29").actual).toBe(16234);
    expect(netWorthAnalysis(validated, "2024-02-29").worth).toBe(-16234);
    expect(
      new CashflowForecast(validated, "2024-02").month("2024-02").expense,
    ).toMatchObject({ known: 16234, scheduled: 0 });
  });
  it("does not forecast a second copy after moving a posted occurrence to another month", () => {
    const { service } = setup(undefined, "2024-01-31");
    const state = service.saveRecurrence({ ...rule, amountMode: "exact" });
    const edited = service.saveTransaction({
      ...state.transactions[0],
      date: "2024-02-29",
    });
    const model = new CashflowForecast(edited, "2024-01");
    expect(model.month("2024-01").expense.scheduled).toBe(0);
    expect(model.month("2024-02").expense).toMatchObject({
      known: 15000,
      scheduled: 15000,
    });
  });
  it("recovers legacy links and installment metadata without changing historical amounts", () => {
    const legacyRule = {
      ...rule,
      amountMode: undefined,
      installmentCount: undefined,
      endDate: "2024-03-31",
    };
    const old = occurrences(legacyRule, "2024-01-01", "2024-01-31")[0];
    delete old.recurrenceDate;
    delete old.installmentNumber;
    delete old.installmentTotal;
    delete old.validationStatus;
    old.date = "2024-02-05";
    old.recurrenceId = null;
    old.amount = -9876;
    const { service } = setup({
      ...emptyLedger(),
      accounts: [{ id: "bank", name: "Banco" }],
      recurrences: [legacyRule],
      transactions: [old],
    });
    const migrated = service.snapshot();
    expect(migrated.transactions[0]).toMatchObject({
      recurrenceId: rule.id,
      recurrenceDate: "2024-01-31",
      installmentNumber: 1,
      installmentTotal: 3,
      validationStatus: "confirmed",
      amount: -9876,
    });
    expect(service.snapshot()).toEqual(migrated);
  });
  it("preserves validations when the rule changes and refuses shortening below existing installments", () => {
    const { service } = setup();
    service.saveRecurrence({ ...rule, amountMode: "exact" });
    expect(
      service
        .saveRecurrence(rule)
        .transactions.every((t) => t.validationStatus === "confirmed"),
    ).toBe(true);
    expect(() =>
      service.saveRecurrence({ ...rule, installmentCount: 1 }),
    ).toThrow("já lançadas");
  });
  it("persists pending and validated state across SQLite reopen", async () => {
    const file = resolve(
      mkdtempSync(resolve(tmpdir(), "lume-validation-")),
      "ledger.sqlite",
    );
    const wasm = resolve("node_modules/sql.js/dist/sql-wasm.wasm");
    const repo = await SqliteLedgerRepository.open(file, wasm);
    repo.save({ ...emptyLedger(), accounts: [{ id: "bank", name: "Banco" }] });
    const service = new LedgerService(repo, { today: () => "2024-02-29" });
    const state = service.saveRecurrence(rule);
    service.saveTransaction({
      ...state.transactions[0],
      validationStatus: "confirmed",
      amount: -12345,
    });
    const reopened = new LedgerService(
      await SqliteLedgerRepository.open(file, wasm),
      { today: () => "2024-02-29" },
    ).snapshot();
    expect(
      reopened.transactions.map((t) => [
        t.amount,
        t.validationStatus,
        installmentLabel(t),
      ]),
    ).toEqual([
      [-12345, "confirmed", "1/3"],
      [-15000, "pending", "2/3"],
    ]);
  });
});
