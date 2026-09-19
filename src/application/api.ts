import type { PlanConfig } from "../domain/planning-model";
import type { Calculation } from "../domain/calculator";
import type { Ledger, Named, Transaction, Recurrence } from "../domain/model";
import type { ImportPreview } from "./ports";
export interface LumeApi {
  saveMonthlyPlan(config: PlanConfig): Promise<Ledger>;
  calculatorHistory(): Promise<Calculation[]>;
  calculate(expression: string): Promise<Calculation>;
  saveSettings(settings: NonNullable<Ledger["settings"]>): Promise<Ledger>;
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
