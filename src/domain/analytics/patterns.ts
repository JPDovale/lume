import type { Ledger, Transaction, Recurrence } from "../model";
import { previousMonths, shiftMonth } from "./calendar";
import { mean, median, deviation } from "./statistics";
export const merchantKey = (
  t: Pick<
    Transaction | Recurrence,
    "accountId" | "description" | "categoryId" | "amount"
  >,
) =>
  JSON.stringify([
    t.accountId,
    t.categoryId,
    t.amount > 0 ? "income" : "expense",
    t.description
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " "),
  ]);
export type MonthlyPattern = {
  key: string;
  description: string;
  categoryId: string | null;
  accountId: string;
  amount: number;
  day: number;
  months: number;
  variation: number;
};
export function detectMonthlyPatterns(
  ledger: Ledger,
  anchorMonth: string,
): MonthlyPattern[] {
  const ruleKeys = new Set(ledger.recurrences.map(merchantKey));
  const window = new Set(previousMonths(anchorMonth, 6));
  const groups = new Map<string, Transaction[]>();
  for (const t of ledger.transactions) {
    if (
      t.transfer ||
      t.openingBalance ||
      t.recurrenceId ||
      !window.has(t.date.slice(0, 7))
    )
      continue;
    const key = merchantKey(t);
    if (ruleKeys.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const patterns: MonthlyPattern[] = [];
  for (const [key, transactions] of groups) {
    const months = transactions.map((t) => t.date.slice(0, 7)).sort();
    if (
      transactions.length < 3 ||
      new Set(months).size !== transactions.length ||
      months.at(-1) !== shiftMonth(anchorMonth, -1)
    )
      continue;
    if (
      !months.slice(1).every((month, i) => month === shiftMonth(months[i], 1))
    )
      continue;
    const amounts = transactions.map((t) => Math.abs(t.amount)),
      days = transactions.map((t) => Number(t.date.slice(8)));
    const variation = deviation(amounts) / mean(amounts);
    if (variation > 0.12 || Math.max(...days) - Math.min(...days) > 6) continue;
    const first = transactions[0];
    patterns.push({
      key,
      description: first.description,
      categoryId: first.categoryId,
      accountId: first.accountId,
      amount: Math.round(median(amounts)) * Math.sign(first.amount),
      day: Math.round(median(days)),
      months: months.length,
      variation,
    });
  }
  return patterns;
}
