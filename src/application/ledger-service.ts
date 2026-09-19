import {
  namedSchema,
  transactionSchema,
  recurrenceSchema,
  type Ledger,
} from "../domain/model";
import { materialize } from "../domain/recurrence";
import type { Clock, LedgerRepository } from "./ports";
export class LedgerService {
  private repository: LedgerRepository;
  private clock: Clock;
  constructor(repository: LedgerRepository, clock: Clock) {
    this.repository = repository;
    this.clock = clock;
  }
  snapshot(): Ledger {
    const state = this.repository.read();
    const due = materialize(
      state.recurrences,
      state.transactions,
      this.clock.today(),
    );
    if (due.length) {
      state.transactions.push(...due);
      this.repository.save(state);
    }
    return state;
  }
  saveTransaction(input: unknown) {
    const tx = transactionSchema.parse(input),
      state = this.repository.read();
    this.references(state, tx);
    const i = state.transactions.findIndex((t) => t.id === tx.id);
    if (i >= 0) state.transactions[i] = tx;
    else state.transactions.push(tx);
    this.repository.save(state);
    return this.snapshot();
  }
  saveRecurrence(input: unknown) {
    const rule = recurrenceSchema.parse(input),
      state = this.repository.read();
    this.references(state, rule);
    const existing = state.recurrences.find((r) => r.id === rule.id);
    if (
      existing &&
      (existing.startDate !== rule.startDate ||
        existing.frequency !== rule.frequency)
    )
      throw new Error(
        "Crie outra recorrência para alterar início ou frequência.",
      );
    state.recurrences = state.recurrences
      .filter((r) => r.id !== rule.id)
      .concat(rule);
    state.transactions.push(
      ...materialize(state.recurrences, state.transactions, this.clock.today()),
    );
    this.repository.save(state);
    return state;
  }
  saveNamed(kind: "accounts" | "categories" | "tags", input: unknown) {
    if (!["accounts", "categories", "tags"].includes(kind))
      throw new Error("Tipo inválido");
    const named = namedSchema.parse(input),
      state = this.repository.read();
    if (
      state[kind].some(
        (v) =>
          v.name.toLowerCase() === named.name.toLowerCase() &&
          v.id !== named.id,
      )
    )
      throw new Error("Esse nome já existe.");
    state[kind] = state[kind].filter((v) => v.id !== named.id).concat(named);
    this.repository.save(state);
    return this.snapshot();
  }
  import(ledger: Ledger) {
    const state = this.repository.read();
    for (const key of [
      "accounts",
      "categories",
      "tags",
      "transactions",
    ] as const) {
      const ids = new Set(state[key].map((v) => v.id));
      const incoming = ledger[key].filter((v) => !ids.has(v.id));
      // Each collection is homogeneous at this boundary; importer validates transaction shapes.
      Object.assign(state, { [key]: [...state[key], ...incoming] });
    }
    state.transactions.forEach((t) => this.references(state, t));
    this.repository.save(state);
    return this.snapshot();
  }
  private references(
    state: Ledger,
    t: { accountId: string; categoryId: string | null; tagIds: string[] },
  ) {
    if (!state.accounts.some((a) => a.id === t.accountId))
      throw new Error("Conta não encontrada.");
    if (t.categoryId && !state.categories.some((c) => c.id === t.categoryId))
      throw new Error("Categoria não encontrada.");
    if (t.tagIds.some((id) => !state.tags.some((t) => t.id === id)))
      throw new Error("Tag não encontrada.");
  }
}
