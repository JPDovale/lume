import type { Ledger } from "./model";
export type AccountSelection = "all" | "primary" | string;
export function accountScope(
  ledger: Ledger,
  selection: AccountSelection,
  spending = false,
): Ledger {
  const selected =
    selection === "primary"
      ? ledger.settings?.primaryAccountId
      : selection === "all"
        ? null
        : selection;
  const excluded = new Set(
    spending && !selected
      ? (ledger.settings?.excludedSpendingAccountIds ?? [])
      : [],
  );
  const accounts = ledger.accounts.filter(
    (a) => (!selected || a.id === selected) && !excluded.has(a.id),
  );
  const ids = new Set(accounts.map((a) => a.id));
  return {
    ...ledger,
    accounts,
    transactions: ledger.transactions.filter((t) => ids.has(t.accountId)),
    recurrences: ledger.recurrences.filter((r) => ids.has(r.accountId)),
  };
}
