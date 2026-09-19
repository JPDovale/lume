import { merchantKey } from "./patterns";
import {
  isConfirmed,
  type Ledger,
  type Recurrence,
  type Transaction,
} from "../model";
import { previousMonths, atDay } from "./calendar";
const unnamed = (t: Transaction) =>
  t.description.trim().toLocaleLowerCase("pt-BR") === "lançamento importado";
/** Forecast-only reconciliation of anonymous imported postings; never assigns a persisted recurrence link. */
export function inferRecurrenceHistory(
  ledger: Ledger,
  anchor: string,
): Map<string, Recurrence> {
  const result = new Map<string, Recurrence>();
  const ambiguous = new Set<string>();
  const recent = previousMonths(anchor, 3);
  for (const rule of ledger.recurrences.filter(
    (r) => r.frequency === "monthly",
  )) {
    const day = Number(rule.startDate.slice(8));
    const rows = ledger.transactions.filter(
      (t) =>
        (unnamed(t) || merchantKey(t) === merchantKey(rule)) &&
        isConfirmed(t) &&
        !t.recurrenceId &&
        !t.transfer &&
        !t.openingBalance &&
        t.accountId === rule.accountId &&
        t.categoryId === rule.categoryId &&
        Math.sign(t.amount) === Math.sign(rule.amount) &&
        Math.abs(
          Number(t.date.slice(8)) -
            Number(atDay(t.date.slice(0, 7), day).slice(8)),
        ) <= 10,
    );
    const closeAmount = (t: Transaction) =>
      Math.abs(t.amount - rule.amount) <= Math.abs(rule.amount) * 0.15;
    // Three complete consecutive months must each contain one unambiguous compatible payment.
    if (
      !recent.every(
        (month) =>
          rows.filter((t) => t.date.startsWith(month) && closeAmount(t))
            .length === 1,
      )
    )
      continue;
    const months = new Set(rows.map((t) => t.date.slice(0, 7)));
    for (const month of months) {
      const monthRows = rows.filter((t) => t.date.startsWith(month));
      // Older salary/rent levels may differ; multiple anonymous postings must not be swallowed as one obligation.
      const candidates =
        monthRows.length === 1 && month < anchor
          ? monthRows
          : monthRows.filter(closeAmount);
      if (candidates.length !== 1) continue;
      const row = candidates[0];
      if (result.has(row.id)) {
        result.delete(row.id);
        ambiguous.add(row.id);
      } else if (!ambiguous.has(row.id)) result.set(row.id, rule);
    }
  }
  return result;
}
