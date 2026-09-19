import type { Ledger, Named, Transaction, Recurrence } from "../domain/model";
import type { ImportPreview } from "./ports";
export interface LumeApi {
  snapshot(): Promise<Ledger>;
  saveTransaction(transaction: Transaction): Promise<Ledger>;
  saveRecurrence(recurrence: Recurrence): Promise<Ledger>;
  saveNamed(
    kind: "accounts" | "categories" | "tags",
    entity: Named,
  ): Promise<Ledger>;
  deleteNamed(
    kind: "categories" | "tags",
    id: string,
    replacementId: string | null,
  ): Promise<Ledger>;
  previewImport(): Promise<ImportPreview | null>;
  confirmImport(): Promise<Ledger>;
  exportBackup(): Promise<boolean>;
}
declare global {
  interface Window {
    lume: LumeApi;
  }
}
