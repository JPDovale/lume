import { isConfirmed, type Ledger, type Recurrence } from "../model";
import { monthsBetween } from "../analytics/calendar";
import { forecastSeries } from "./series";
import {
  fixedDistribution,
  empiricalDistribution,
  type Distribution,
} from "./distribution";
export function recurringAmount(
  rule: Recurrence,
  ledger: Ledger,
  anchor: string,
  targetDate: string,
  inferred: Map<string, Recurrence>,
): Distribution & { samples: number } {
  const configured = Math.abs(rule.amount);
  if (rule.amountMode !== "approximate")
    return { ...fixedDistribution(configured), samples: 0 };
  const rows = ledger.transactions
    .filter(
      (t) =>
        isConfirmed(t) &&
        !t.transfer &&
        !t.openingBalance &&
        t.date < `${anchor}-01` &&
        (t.recurrenceId === rule.id || inferred.get(t.id)?.id === rule.id),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-36);
  if (rows.length < 3)
    return { ...empiricalDistribution(configured, []), samples: rows.length };
  const last = rows.at(-1)!;
  const steps =
    rule.frequency === "monthly"
      ? Math.max(
          1,
          monthsBetween(last.date.slice(0, 7), targetDate.slice(0, 7)),
        )
      : rule.frequency === "yearly"
        ? Math.max(
            1,
            Number(targetDate.slice(0, 4)) - Number(last.date.slice(0, 4)),
          )
        : Math.max(
            1,
            Math.round(
              (Date.parse(targetDate) - Date.parse(last.date)) / (7 * 86400000),
            ),
          );
  const model = forecastSeries(
    rows.map((t) => Math.abs(t.amount)),
    steps,
  );
  // Weekly errors have a different time grain. Do not invent a monthly joint interval from them.
  const regular =
    rule.frequency === "monthly" &&
    rows.every(
      (r, i) =>
        !i ||
        monthsBetween(rows[i - 1].date.slice(0, 7), r.date.slice(0, 7)) === 1,
    );
  return {
    ...empiricalDistribution(
      model.expected,
      regular
        ? model.errors.map((e) => ({
            month: rows[e.targetIndex].date.slice(0, 7),
            amount: Math.max(0, model.expected + e.error),
          }))
        : [],
    ),
    samples: rows.length,
  };
}
export function recurrenceSignature(ledger: Ledger) {
  return JSON.stringify(
    ledger.recurrences
      .map((r) => [
        r.id,
        r.accountId,
        r.categoryId,
        r.amount,
        r.amountMode ?? "exact",
        r.startDate,
        r.endDate,
        r.installmentCount ?? null,
        r.frequency,
        r.active,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
