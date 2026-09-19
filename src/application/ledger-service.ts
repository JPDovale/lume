import {
  namedSchema,
  transactionSchema,
  recurrenceSchema,
  type Ledger,
} from "../domain/model";
import {
  materialize,
  linkOccurrence,
  installmentTotal,
} from "../domain/recurrence";
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
    const linked = state.transactions.map((t) =>
      linkOccurrence(t, state.recurrences),
    );
    const migrated =
      JSON.stringify(linked) !== JSON.stringify(state.transactions);
    state.transactions = linked;
    const due = materialize(
      state.recurrences,
      state.transactions,
      this.clock.today(),
    );
    if (due.length || migrated) {
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
    const previous =
      i >= 0
        ? linkOccurrence(state.transactions[i], state.recurrences)
        : undefined;
    if (previous?.recurrenceId) {
      if (tx.recurrenceId && tx.recurrenceId !== previous.recurrenceId)
        throw new Error("Não é possível trocar a recorrência de origem.");
      Object.assign(tx, {
        recurrenceId: previous.recurrenceId,
        recurrenceDate: previous.recurrenceDate,
        installmentNumber: previous.installmentNumber,
        installmentTotal: previous.installmentTotal,
        validationStatus: tx.validationStatus ?? previous.validationStatus,
      });
      if (tx.transfer || tx.openingBalance)
        throw new Error(
          "Uma parcela não pode ser transferência ou saldo inicial.",
        );
    } else if (tx.recurrenceId || tx.validationStatus === "pending") {
      throw new Error(
        "Lançamentos recorrentes devem ser gerados pela recorrência.",
      );
    }
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
      state.transactions.some(
        (t) => linkOccurrence(t, [existing]).recurrenceId === existing.id,
      ) &&
      (existing.startDate !== rule.startDate ||
        existing.frequency !== rule.frequency)
    )
      throw new Error(
        "Crie outra recorrência para alterar início ou frequência.",
      );
    const total = installmentTotal(rule);
    if (
      existing &&
      total !== null &&
      state.transactions.some(
        (t) =>
          t.recurrenceId === rule.id &&
          (linkOccurrence(t, [existing]).installmentNumber ?? 0) > total,
      )
    )
      throw new Error("O fim não pode excluir parcelas já lançadas.");
    state.recurrences = state.recurrences
      .filter((r) => r.id !== rule.id)
      .concat(rule);
    state.transactions.push(
      ...materialize(state.recurrences, state.transactions, this.clock.today()),
    );
    this.repository.save(state);
    return this.snapshot();
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
  deleteNamed(
    kind: "categories" | "tags",
    id: string,
    replacementId: string | null = null,
  ) {
    if (kind !== "categories" && kind !== "tags")
      throw new Error("Tipo inválido para exclusão.");
    const state = this.repository.read();
    if (!state[kind].some((entity) => entity.id === id))
      throw new Error("Item não encontrado.");
    const linked = (entry: { categoryId: string | null; tagIds: string[] }) =>
      kind === "categories"
        ? entry.categoryId === id
        : entry.tagIds.includes(id);
    const hasLinks =
      state.transactions.some(linked) || state.recurrences.some(linked);
    if (hasLinks && !replacementId)
      throw new Error("Selecione um destino para os registros vinculados.");
    if (
      replacementId &&
      (replacementId === id ||
        !state[kind].some((entity) => entity.id === replacementId))
    )
      throw new Error("Selecione outro destino válido.");
    const move = <T extends { categoryId: string | null; tagIds: string[] }>(
      entry: T,
    ): T => ({
      ...entry,
      categoryId:
        kind === "categories" && entry.categoryId === id
          ? replacementId
          : entry.categoryId,
      tagIds:
        kind === "tags"
          ? [
              ...new Set(
                entry.tagIds.map((tag) => (tag === id ? replacementId! : tag)),
              ),
            ]
          : entry.tagIds,
    });
    state.transactions = state.transactions.map(move);
    state.recurrences = state.recurrences.map(move);
    state[kind] = state[kind].filter((entity) => entity.id !== id);
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
