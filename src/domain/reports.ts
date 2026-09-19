import { isConfirmed, type Ledger } from "./model";
import { CashflowForecast, isFinancial } from "./analytics/forecast";
import { shiftMonth } from "./analytics/calendar";
import { total } from "./analytics/statistics";
/** Compact summary for consumers that do not need the full analytics dashboards. */
export function report(ledger: Ledger, today: string) {
  const model = new CashflowForecast(ledger, today.slice(0, 7));
  const next = model.month(shiftMonth(today.slice(0, 7), 1)).expense;
  const current = ledger.transactions.filter(
    (t) =>
      t.date.startsWith(today.slice(0, 7)) && t.date <= today && isFinancial(t),
  );
  return {
    sampleMonths: model.sampleMonths.length,
    variable: next.variable,
    committed: next.known + next.scheduled,
    forecast: next.expected,
    income: total(current.filter((t) => t.amount > 0).map((t) => t.amount)),
    expenses: total(current.filter((t) => t.amount < 0).map((t) => -t.amount)),
    balance: total(
      ledger.transactions
        .filter((t) => t.date <= today && isConfirmed(t))
        .map((t) => t.amount),
    ),
  };
}
