import type { Ledger } from "../domain/model";
export interface LedgerRepository {
  read(): Ledger;
  save(ledger: Ledger): void;
}
export interface Clock {
  today(): string;
}
export type ImportPreview = {
  accounts: number;
  categories: number;
  transactions: number;
  duplicates: number;
  warnings: string[];
};
export interface Importer {
  parse(bytes: Uint8Array): Promise<{ ledger: Ledger; warnings: string[] }>;
}
