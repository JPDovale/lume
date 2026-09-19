import initSqlJs from "sql.js";
import { unzipSync } from "fflate";
import { emptyLedger, transactionSchema } from "../domain/model";
import type { Importer } from "../application/ports";
export class ActualImporter implements Importer {
  private wasmPath: string;
  constructor(wasmPath: string) {
    this.wasmPath = wasmPath;
  }
  async parse(bytes: Uint8Array) {
    if (bytes.length > 250 * 1024 * 1024)
      throw new Error("O arquivo excede 250 MB.");
    let sqlite = bytes;
    if (bytes[0] === 80 && bytes[1] === 75) {
      const files = unzipSync(bytes, {
        filter: (f) =>
          f.name.endsWith("db.sqlite") && f.originalSize <= 500 * 1024 * 1024,
      });
      const entry = Object.entries(files).find(
        ([name]) => name === "db.sqlite" || name.endsWith("/db.sqlite"),
      );
      if (!entry)
        throw new Error(
          "O ZIP não contém db.sqlite válido. Exporte pelos ajustes do Actual.",
        );
      sqlite = entry[1];
    }
    const SQL = await initSqlJs({ locateFile: () => this.wasmPath }),
      db = new SQL.Database(sqlite);
    type Row = Record<string, string | number | null | Uint8Array>;
    const rows = (table: string): Row[] => {
      const result = db.exec(`SELECT * FROM "${table}"`)[0];
      return result
        ? result.values.map((v) =>
            Object.fromEntries(result.columns.map((c, i) => [c, v[i]])),
          )
        : [];
    };
    const exists = (table: string) =>
      db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [
        table,
      ]).length > 0;
    try {
      if (!["accounts", "categories", "transactions"].every(exists))
        throw new Error("Banco incompatível com o Actual Budget.");
      const state = emptyLedger(),
        warnings: string[] = [];
      const id = (value: unknown) => `actual:${String(value)}`;
      const active = (r: Row) => !r.tombstone;
      const accountRows = rows("accounts"),
        categoryRows = rows("categories");
      const categoryMap = new Map(
        exists("category_mapping")
          ? rows("category_mapping").map((r) => [String(r.id), r.transferId])
          : [],
      );
      const payeeMap = new Map(
        exists("payee_mapping")
          ? rows("payee_mapping").map((r) => [String(r.id), r.targetId])
          : [],
      );
      const payees = new Map(
        exists("payees") ? rows("payees").map((r) => [String(r.id), r]) : [],
      );
      state.accounts = accountRows.filter(active).map((r) => ({
        id: id(r.id),
        name: String(r.name || "Conta importada"),
      }));
      state.categories = categoryRows.filter(active).map((r) => ({
        id: id(r.id),
        name: String(r.name || "Categoria importada"),
      }));
      const source = rows("transactions"),
        parents = new Map(
          source.filter((r) => r.isParent).map((r) => [String(r.id), r]),
        );
      let splitCount = 0,
        skipped = 0;
      for (const r of source) {
        if (r.tombstone || r.isParent) continue;
        const parent = r.isChild ? parents.get(String(r.parent_id)) : undefined;
        if (r.isChild && (!parent || parent.tombstone)) continue;
        const rawDate = String(parent?.date ?? r.date ?? "");
        const date = /^\d{8}$/.test(rawDate)
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}`
          : rawDate;
        const account = parent?.acct ?? r.acct;
        if (!account || !rawDate) {
          skipped++;
          continue;
        }
        if (!state.accounts.some((a) => a.id === id(account))) {
          const original = accountRows.find((a) => a.id === account);
          state.accounts.push({
            id: id(account),
            name: String(original?.name || "Conta arquivada"),
          });
        }
        const category = categoryMap.get(String(r.category)) ?? r.category;
        if (category && !state.categories.some((c) => c.id === id(category))) {
          state.categories.push({
            id: id(category),
            name: String(
              categoryRows.find((c) => c.id === category)?.name ||
                "Categoria arquivada",
            ),
          });
        }
        const payee = payees.get(
          String(payeeMap.get(String(r.description)) ?? r.description),
        );
        const notes = String(r.notes ?? parent?.notes ?? "");
        const tags = [...notes.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map(
          (m) => m[1],
        );
        for (const name of tags)
          if (!state.tags.some((t) => t.id === `actual-tag:${name}`))
            state.tags.push({ id: `actual-tag:${name}`, name });
        const amount = Number(r.amount ?? 0);
        if (amount === 0) {
          skipped++;
          continue;
        }
        state.transactions.push(
          transactionSchema.parse({
            id: id(r.id),
            accountId: id(account),
            description: String(
              payee?.name ||
                r.imported_description ||
                r.description ||
                "Lançamento importado",
            ),
            amount,
            date,
            categoryId: category ? id(category) : null,
            tagIds: tags.map((t) => `actual-tag:${t}`),
            notes,
            transfer: Boolean(
              r.transferred_id ||
              parent?.transferred_id ||
              payee?.transfer_acct,
            ),
            openingBalance: Boolean(
              r.starting_balance_flag || parent?.starting_balance_flag,
            ),
            recurrenceId: null,
          }),
        );
        if (r.isChild) splitCount++;
      }
      if (splitCount)
        warnings.push(
          `${splitCount} parcelas de lançamentos divididos serão importadas individualmente, sem duplicar o total.`,
        );
      if (skipped)
        warnings.push(
          `${skipped} registros sem valor, conta ou data foram ignorados.`,
        );
      if (exists("schedules") && rows("schedules").some(active))
        warnings.push(
          "Agendamentos do Actual não são convertidos nesta versão. Cadastre as recorrências no Lume; o histórico será preservado.",
        );
      warnings.push(
        "Importação de contas, categorias, lançamentos e hashtags das notas. Orçamentos, metas, regras e conciliação do Actual não são migrados.",
      );
      return { ledger: state, warnings };
    } finally {
      db.close();
    }
  }
}
