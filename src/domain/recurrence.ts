import type { Recurrence, Transaction } from "./model";
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function occurrenceDate(rule: Recurrence, index: number): string {
  const [y, m, day] = rule.startDate.split("-").map(Number);
  if (rule.frequency === "weekly")
    return iso(new Date(Date.UTC(y, m - 1, day + index * 7)));
  const month = m - 1 + (rule.frequency === "monthly" ? index : index * 12);
  const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, month, Math.min(day, last))));
}
export function occurrences(
  rule: Recurrence,
  from: string,
  to: string,
): Transaction[] {
  if (!rule.active || from > to) return [];
  const result: Transaction[] = [];
  for (let i = 0; i < 100000; i++) {
    const date = occurrenceDate(rule, i);
    if (date > to || (rule.endDate && date > rule.endDate)) break;
    if (date < from) continue;
    result.push({
      id: `rec:${rule.id}:${date}`,
      description: rule.description,
      accountId: rule.accountId,
      amount: rule.amount,
      categoryId: rule.categoryId,
      tagIds: [...rule.tagIds],
      notes: rule.notes,
      date,
      transfer: false,
      openingBalance: false,
      recurrenceId: rule.id,
    });
  }
  return result;
}
export function materialize(
  rules: Recurrence[],
  existing: Transaction[],
  today: string,
): Transaction[] {
  const ids = new Set(existing.map((t) => t.id));
  return rules
    .flatMap((r) => occurrences(r, r.startDate, today))
    .filter((t) => !ids.has(t.id));
}
