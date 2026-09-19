import type { Ledger } from "../model";
import { CashflowForecast, isFinancial } from "./forecast";
import { monthEnd, previousMonths, shiftMonth } from "./calendar";
import { total } from "./statistics";
export function netWorthAnalysis(
  ledger: Ledger,
  today: string,
  historyLength = 12,
  horizon = 6,
) {
  const month = today.slice(0, 7);
  const recorded = [...ledger.transactions]
    .filter((t) => t.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = recorded[0]?.date;
  const accounts = ledger.accounts.map((a) => ({
    ...a,
    balance: total(
      recorded.filter((t) => t.accountId === a.id).map((t) => t.amount),
    ),
  }));
  const assets = total(
    accounts.filter((a) => a.balance > 0).map((a) => a.balance),
  );
  const liabilities =
    -total(accounts.filter((a) => a.balance < 0).map((a) => a.balance)) || 0;
  const worth = assets - liabilities;
  const startMonth = shiftMonth(month, 1 - historyLength);
  const opening = total(
    recorded.filter((t) => t.date < `${startMonth}-01`).map((t) => t.amount),
  );
  const windowRows = recorded.filter((t) => t.date >= `${startMonth}-01`);
  const income = total(
    windowRows
      .filter((t) => isFinancial(t) && t.amount > 0)
      .map((t) => t.amount),
  );
  const expenses =
    -total(
      windowRows
        .filter((t) => isFinancial(t) && t.amount < 0)
        .map((t) => t.amount),
    ) || 0;
  const adjustments = total(
    windowRows.filter((t) => t.openingBalance).map((t) => t.amount),
  );
  const transferImpact = total(
    windowRows
      .filter((t) => t.transfer && !t.openingBalance)
      .map((t) => t.amount),
  );
  let pointer = 0;
  const balances = new Map<string, number>();
  const history = [...previousMonths(month, historyLength - 1), month].map(
    (m) => {
      const date = m === month ? today : monthEnd(m);
      while (pointer < recorded.length && recorded[pointer].date <= date) {
        const t = recorded[pointer++];
        balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + t.amount);
      }
      const values = [...balances.values()],
        observed = !!firstDate && date >= firstDate;
      const rows = recorded.filter(
        (t) => t.date.startsWith(m) && isFinancial(t),
      );
      const income = total(
          rows.filter((t) => t.amount > 0).map((t) => t.amount),
        ),
        expenses =
          -total(rows.filter((t) => t.amount < 0).map((t) => t.amount)) || 0;
      return {
        month: m,
        date,
        netWorth: observed ? total(values) : null,
        assets: observed ? total(values.filter((v) => v > 0)) : null,
        liabilities: observed ? -total(values.filter((v) => v < 0)) || 0 : null,
        income,
        expenses,
        savings: income - expenses,
        balances: Object.fromEntries(balances),
        partial: m === month,
      };
    },
  );
  const model = new CashflowForecast(ledger, month);
  const currentRows = recorded.filter(
    (t) => t.date.startsWith(month) && isFinancial(t),
  );
  const currentIncome = total(
      currentRows.filter((t) => t.amount > 0).map((t) => t.amount),
    ),
    currentExpenses =
      -total(currentRows.filter((t) => t.amount < 0).map((t) => t.amount)) || 0;
  let expected = worth,
    low = worth,
    high = worth;
  const projection: {
    month: string;
    date: string;
    expected: number;
    low: number;
    high: number;
    income: number;
    expenses: number;
  }[] = [];
  if (firstDate && model.sampleMonths.length >= 2) {
    // Finish the current month using only its remaining expected cash flow, then project complete future months.
    for (let offset = 0; offset <= horizon; offset++) {
      const m = shiftMonth(month, offset),
        forecast = model.month(m);
      if (offset === 0 && today === monthEnd(month)) continue;
      const alreadyIncome = offset === 0 ? currentIncome : 0,
        alreadyExpenses = offset === 0 ? currentExpenses : 0;
      const futureAdjustments = total(
        ledger.transactions
          .filter(
            (t) => t.date > today && t.date.startsWith(m) && !isFinancial(t),
          )
          .map((t) => t.amount),
      );
      const incoming = Math.max(0, forecast.income.expected! - alreadyIncome),
        outgoing = Math.max(0, forecast.expense.expected! - alreadyExpenses);
      expected += incoming - outgoing + futureAdjustments;
      low +=
        Math.max(0, forecast.income.low! - alreadyIncome) -
        Math.max(0, forecast.expense.high! - alreadyExpenses) +
        futureAdjustments;
      high +=
        Math.max(0, forecast.income.high! - alreadyIncome) -
        Math.max(0, forecast.expense.low! - alreadyExpenses) +
        futureAdjustments;
      projection.push({
        month: m,
        date: monthEnd(m),
        expected,
        low,
        high,
        income: incoming,
        expenses: outgoing,
      });
    }
  }
  return {
    month,
    firstDate,
    accounts,
    assets,
    liabilities,
    worth,
    history,
    projection,
    income,
    expenses,
    savings: income - expenses,
    savingRate: income ? ((income - expenses) / income) * 100 : null,
    opening,
    adjustments,
    transferImpact,
    delta: worth - opening,
    sampleMonths: model.sampleMonths.length,
    horizon,
  };
}
export type NetWorthAnalysis = ReturnType<typeof netWorthAnalysis>;
