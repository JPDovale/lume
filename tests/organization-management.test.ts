import { describe, it, expect } from "vitest";
import { emptyLedger, type Ledger, type Recurrence } from "../src/domain/model";
import { LedgerService } from "../src/application/ledger-service";
const rule: Recurrence = {
  id: "r",
  description: "Energia",
  accountId: "bank",
  categoryId: "source",
  tagIds: ["old", "new"],
  amount: -10000,
  notes: "Manter",
  recurrenceId: null,
  startDate: "2024-01-31",
  endDate: null,
  installmentCount: 3,
  amountMode: "approximate",
  frequency: "monthly",
  active: true,
};
function setup() {
  let state: Ledger = {
    ...emptyLedger(),
    accounts: [{ id: "bank", name: "Banco" }],
    categories: [
      { id: "source", name: "Origem" },
      { id: "target", name: "Destino" },
    ],
    tags: [
      { id: "old", name: "Antiga" },
      { id: "new", name: "Nova" },
    ],
  };
  let today = "2024-01-31";
  const repository = {
    read: () => structuredClone(state),
    save: (next: Ledger) => {
      state = structuredClone(next);
    },
  };
  const service = new LedgerService(repository, { today: () => today });
  return {
    service,
    repository,
    advance: () => {
      today = "2024-04-30";
    },
  };
}
describe("organization management", () => {
  it("renames without changing identity and rejects duplicate names", () => {
    const { service } = setup();
    service.saveRecurrence(rule);
    expect(
      service.saveNamed("categories", { id: "source", name: "Casa" })
        .transactions[0].categoryId,
    ).toBe("source");
    expect(
      service.saveNamed("tags", { id: "old", name: "Essencial" }).recurrences[0]
        .tagIds,
    ).toEqual(["old", "new"]);
    expect(() =>
      service.saveNamed("categories", { id: "source", name: "destino" }),
    ).toThrow("já existe");
  });
  it("requires a valid different destination and leaves all data unchanged on rejection", () => {
    const { service, repository } = setup();
    const before = service.saveRecurrence(rule);
    for (const destination of [null, "source", "missing", "old"]) {
      expect(() =>
        service.deleteNamed("categories", "source", destination),
      ).toThrow();
      expect(repository.read()).toEqual(before);
    }
    expect(() => service.deleteNamed("tags", "old", null)).toThrow("destino");
    expect(() =>
      service.deleteNamed("accounts" as "tags", "bank", null),
    ).toThrow("Tipo");
    expect(() => service.deleteNamed("tags", "missing", "new")).toThrow(
      "encontrado",
    );
  });
  it("moves category references atomically and uses the destination for future installments", () => {
    const { service, advance } = setup();
    const before = service.saveRecurrence(rule);
    const after = service.deleteNamed("categories", "source", "target");
    expect(after.categories.map((c) => c.id)).toEqual(["target"]);
    expect(after.transactions[0]).toEqual({
      ...before.transactions[0],
      categoryId: "target",
    });
    expect(after.recurrences[0].categoryId).toBe("target");
    advance();
    const future = service.snapshot();
    expect(future.transactions).toHaveLength(3);
    expect(future.transactions.every((t) => t.categoryId === "target")).toBe(
      true,
    );
  });
  it("merges tags without duplicates, preserving amounts, statuses and recurrence links", () => {
    const { service, advance } = setup();
    const before = service.saveRecurrence(rule);
    const after = service.deleteNamed("tags", "old", "new");
    expect(after.tags.map((t) => t.id)).toEqual(["new"]);
    expect(after.transactions[0]).toEqual({
      ...before.transactions[0],
      tagIds: ["new"],
    });
    expect(after.recurrences[0].tagIds).toEqual(["new"]);
    advance();
    expect(
      service
        .snapshot()
        .transactions.every(
          (t) => t.tagIds.length === 1 && t.tagIds[0] === "new",
        ),
    ).toBe(true);
  });
  it("also requires a destination for rules without generated transactions", () => {
    const { service } = setup();
    service.saveRecurrence({ ...rule, startDate: "2030-01-01" });
    expect(() => service.deleteNamed("categories", "source")).toThrow(
      "destino",
    );
    expect(() => service.deleteNamed("tags", "old")).toThrow("destino");
  });
  it("allows deleting an unused item without a destination", () => {
    const { service } = setup();
    expect(service.deleteNamed("categories", "source").categories).toHaveLength(
      1,
    );
    expect(service.deleteNamed("tags", "old").tags).toHaveLength(1);
  });
});
describe("recurrence editing", () => {
  it("edits upcoming values and precision without rewriting generated installments", () => {
    const { service, advance } = setup();
    const before = service.saveRecurrence(rule);
    service.saveRecurrence({
      ...rule,
      description: "Energia revisada",
      amount: -20000,
      amountMode: "exact",
      installmentCount: 4,
    });
    advance();
    const after = service.snapshot();
    expect(after.transactions).toHaveLength(4);
    expect(after.transactions[0]).toEqual({
      ...before.transactions[0],
      installmentTotal: 4,
    });
    expect(after.transactions[1]).toMatchObject({
      amount: -20000,
      description: "Energia revisada",
      validationStatus: "confirmed",
      installmentNumber: 2,
      installmentTotal: 4,
    });
  });
  it("allows scheduling changes before generation and protects the schedule afterwards", () => {
    const { service } = setup();
    service.saveRecurrence({ ...rule, startDate: "2030-01-01" });
    expect(
      service.saveRecurrence({
        ...rule,
        startDate: "2031-01-01",
        frequency: "weekly",
      }).recurrences[0].frequency,
    ).toBe("weekly");
    service.saveRecurrence(rule);
    expect(() =>
      service.saveRecurrence({ ...rule, frequency: "yearly" }),
    ).toThrow("frequência");
  });
});
