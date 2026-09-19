import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  parseMoney,
  type Ledger,
  type Transaction,
  type Recurrence,
} from "../src/domain/model";
import { occurrenceDate, materialize } from "../src/domain/recurrence";
import { report } from "../src/domain/reports";
import { LedgerService } from "../src/application/ledger-service";
const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx",
  accountId: "account",
  amount: -10000,
  date: "2026-01-01",
  description: "Compra",
  categoryId: null,
  tagIds: [],
  notes: "",
  transfer: false,
  openingBalance: false,
  recurrenceId: null,
  ...overrides,
});
const rule: Recurrence = {
  id: "rent",
  accountId: "account",
  amount: -10000,
  description: "Aluguel",
  categoryId: null,
  tagIds: [],
  notes: "",
  recurrenceId: null,
  startDate: "2024-01-31",
  endDate: null,
  frequency: "monthly",
  active: true,
};
function memory(state: Ledger = emptyLedger()) {
  return {
    read: () => structuredClone(state),
    save: (next: Ledger) => {
      state = structuredClone(next);
    },
  };
}
describe("money", () => {
  it("parses BRL without floating errors", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("0,29")).toBe(29);
    expect(() => parseMoney("2,345")).toThrow();
    expect(() => parseMoney("0")).toThrow();
  });
});
describe("recurrences", () => {
  it("clamps month end and returns to the anchor day", () => {
    expect(occurrenceDate(rule, 1)).toBe("2024-02-29");
    expect(occurrenceDate(rule, 2)).toBe("2024-03-31");
    expect(occurrenceDate(rule, 13)).toBe("2025-02-28");
  });
  it("respects end and active flag and never duplicates materialized dates", () => {
    const r = { ...rule, endDate: "2024-03-01" },
      first = materialize([r], [], "2024-04-01");
    expect(first.map((t) => t.date)).toEqual(["2024-01-31", "2024-02-29"]);
    expect(materialize([r], first, "2024-04-01")).toEqual([]);
    expect(materialize([{ ...r, active: false }], [], "2024-04-01")).toEqual(
      [],
    );
  });
  it("does not duplicate after reopening the application", () => {
    const repository = memory({
      ...emptyLedger(),
      accounts: [{ id: "account", name: "Conta" }],
    });
    new LedgerService(repository, { today: () => "2024-02-29" }).saveRecurrence(
      rule,
    );
    const reopened = new LedgerService(repository, {
      today: () => "2024-02-29",
    });
    expect(reopened.snapshot().transactions).toHaveLength(2);
    expect(reopened.snapshot().transactions).toHaveLength(2);
  });
});
describe("reports", () => {
  it("excludes transfers, opening balances, future dates, and recurring history from variable estimate", () => {
    const state = {
      ...emptyLedger(),
      recurrences: [{ ...rule, startDate: "2026-01-01" }],
      transactions: [
        tx({ id: "jan", date: "2026-01-15" }),
        tx({ id: "feb", date: "2026-02-15", amount: -30000 }),
        tx({ id: "mar", date: "2026-03-15", amount: -10000 }),
        tx({
          id: "transfer",
          date: "2026-02-12",
          amount: -90000,
          transfer: true,
        }),
        tx({
          id: "opening",
          date: "2026-02-12",
          amount: -90000,
          openingBalance: true,
        }),
        tx({
          id: "rent",
          date: "2026-02-01",
          amount: -10000,
          recurrenceId: "rent",
        }),
        tx({ id: "future", date: "2026-04-30", amount: -50000 }),
      ],
    };
    const r = report(state, "2026-04-10");
    expect(r.sampleMonths).toBe(2);
    expect(r.variable).toBe(16667);
    expect(r.committed).toBe(10000);
    expect(r.forecast).toBe(26667);
    expect(r.expenses).toBe(0);
  });
  it("does not claim a forecast without completed history", () =>
    expect(report(emptyLedger(), "2026-09-18").forecast).toBeNull());
  it("counts an already posted scheduled occurrence only once", () => {
    const r = { ...rule, startDate: "2026-01-01" };
    const state = {
      ...emptyLedger(),
      recurrences: [r],
      transactions: materialize([r], [], "2026-05-01"),
    };
    expect(report(state, "2026-04-10").committed).toBe(10000);
  });
});
describe("service boundaries", () => {
  it("rejects invalid account and invalid dates before writing", () => {
    const repository = memory(),
      service = new LedgerService(repository, { today: () => "2026-09-18" });
    expect(() => service.saveTransaction(tx())).toThrow("Conta");
    expect(() => service.saveTransaction(tx({ date: "2026-02-30" }))).toThrow();
    expect(repository.read().transactions).toHaveLength(0);
  });
});
