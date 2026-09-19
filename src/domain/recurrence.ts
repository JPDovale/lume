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
    if (
      date > to ||
      (rule.endDate && date > rule.endDate) ||
      (rule.installmentCount && i >= rule.installmentCount)
    )
      break;
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
      recurrenceDate: date,
      installmentNumber: i + 1,
      installmentTotal: installmentTotal(rule) ?? undefined,
      validationStatus:
        rule.amountMode === "approximate" ? "pending" : "confirmed",
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
  const slots = new Set(
    existing
      .filter((t) => t.recurrenceId)
      .map((t) => `${t.recurrenceId}:${t.recurrenceDate ?? t.date}`),
  );
  return rules
    .flatMap((r) => occurrences(r, r.startDate, today))
    .filter(
      (t) =>
        !ids.has(t.id) && !slots.has(`${t.recurrenceId}:${t.recurrenceDate}`),
    );
}

/** Includes the final date and preserves the original day when months are shorter. */
export function installmentTotal(rule: Recurrence): number | null {
  if (rule.installmentCount) return rule.installmentCount;
  if (!rule.endDate) return null;
  const index = occurrenceIndex(rule, rule.endDate);
  return index + (occurrenceDate(rule, index) <= rule.endDate ? 1 : 0);
}
/** Recover origin metadata for records created before installment support. */
export function linkOccurrence(
  t: Transaction,
  rules: Recurrence[],
): Transaction {
  const rule =
    rules.find((r) => r.id === t.recurrenceId) ??
    rules.find(
      (r) =>
        t.id === `rec:${r.id}:${t.id.slice(-10)}` &&
        /^\d{4}-\d{2}-\d{2}$/.test(t.id.slice(-10)),
    );
  if (!rule) return t;
  const prefix = `rec:${rule.id}:`;
  const date =
    t.recurrenceDate ??
    (t.id.startsWith(prefix) ? t.id.slice(prefix.length) : t.date);
  return {
    ...t,
    recurrenceId: rule.id,
    recurrenceDate: date,
    installmentNumber: t.installmentNumber ?? occurrenceIndex(rule, date) + 1,
    installmentTotal: installmentTotal(rule) ?? undefined,
    // Historical entries are confirmed; changing a rule never reopens past validations.
    validationStatus: t.validationStatus ?? "confirmed",
  };
}
export function installmentLabel(t: Transaction): string {
  return t.installmentNumber && t.installmentTotal
    ? `${t.installmentNumber}/${t.installmentTotal}`
    : "Recorrente";
}

function occurrenceIndex(rule: Recurrence, date: string): number {
  if (rule.frequency === "weekly")
    return Math.max(
      0,
      Math.floor(
        (Date.parse(date) - Date.parse(rule.startDate)) / (7 * 86400000),
      ),
    );
  const [year, month] = date.split("-").map(Number);
  const [startYear, startMonth] = rule.startDate.split("-").map(Number);
  return Math.max(
    0,
    Math.floor(
      ((year - startYear) * 12 + month - startMonth) /
        (rule.frequency === "yearly" ? 12 : 1),
    ),
  );
}
