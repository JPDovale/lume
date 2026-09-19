import type { Transaction } from "../model";
import { mean, median, percentChange, total } from "./statistics";
import { adaptiveForecast } from "./adaptive-forecast";
import { merchantKey } from "./patterns";
export function behaviorAnalysis(
  rows: Transaction[],
  months: string[],
  today: string,
) {
  const buckets = months.map((month) => {
    const entries = rows.filter((t) => t.date.startsWith(month));
    return {
      month,
      amount: total(entries.map((t) => Math.abs(t.amount))),
      count: entries.length,
    };
  });
  const recent = buckets.slice(-3),
    previous = buckets.slice(-6, -3);
  const recentAmount = mean(recent.map((b) => b.amount)),
    previousAmount = mean(previous.map((b) => b.amount));
  const recentCount = mean(recent.map((b) => b.count)),
    previousCount = mean(previous.map((b) => b.count));
  const recentTicket = recentCount ? recentAmount / recentCount : 0,
    previousTicket = previousCount ? previousAmount / previousCount : 0;
  const comparable = recent.length === 3 && previous.length === 3;
  const frequencyImpact = comparable
    ? (recentCount - previousCount) * previousTicket
    : 0;
  const ticketImpact = comparable
    ? recentCount * (recentTicket - previousTicket)
    : 0;
  const recentMonths = new Set(recent.map((b) => b.month)),
    priorMonths = new Set(previous.map((b) => b.month));
  const groups = new Map<
    string,
    { name: string; recent: number; previous: number; count: number }
  >();
  for (const t of rows) {
    const key = merchantKey(t),
      m = t.date.slice(0, 7);
    if (!recentMonths.has(m) && !priorMonths.has(m)) continue;
    const group = groups.get(key) ?? {
      name: t.description,
      recent: 0,
      previous: 0,
      count: 0,
    };
    if (recentMonths.has(m)) {
      group.recent += Math.abs(t.amount);
      group.count++;
    } else group.previous += Math.abs(t.amount);
    groups.set(key, group);
  }
  const drivers = comparable
    ? [...groups.values()]
        .map((g) => ({
          ...g,
          delta: Math.round((g.recent - g.previous) / 3),
          emerging: g.previous === 0 && g.count >= 3,
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3)
    : [];
  const model = adaptiveForecast(buckets.map((b) => b.amount));
  const recentRows = rows.filter((t) => recentMonths.has(t.date.slice(0, 7)));
  const weekend = recentRows.filter((t) =>
    [0, 6].includes(new Date(`${t.date}T12:00:00Z`).getUTCDay()),
  );
  const day = Number(today.slice(8));
  const current = rows.filter(
    (t) => t.date.startsWith(today.slice(0, 7)) && t.date <= today,
  );
  const shares = buckets
    .slice(-6)
    .filter((b) => b.amount > 0)
    .map(
      (b) =>
        total(
          rows
            .filter(
              (t) =>
                t.date.startsWith(b.month) && Number(t.date.slice(8)) <= day,
            )
            .map((t) => Math.abs(t.amount)),
        ) / b.amount,
    );
  const elapsedShare = median(shares);
  return {
    buckets,
    comparable,
    recentAverage: Math.round(recentAmount),
    previousAverage: Math.round(previousAmount),
    change: comparable ? percentChange(recentAmount, previousAmount) : null,
    recentCount: Math.round(recentCount * 10) / 10,
    previousCount: Math.round(previousCount * 10) / 10,
    recentTicket: Math.round(recentTicket),
    previousTicket: Math.round(previousTicket),
    frequencyImpact: Math.round(frequencyImpact),
    ticketImpact: Math.round(ticketImpact),
    drivers,
    model,
    weekendShare:
      recentRows.length >= 10
        ? total(weekend.map((t) => Math.abs(t.amount))) /
          Math.max(1, total(recentRows.map((t) => Math.abs(t.amount))))
        : null,
    pace:
      day >= 7 &&
      shares.length >= 3 &&
      elapsedShare >= 0.15 &&
      elapsedShare <= 0.95 &&
      current.length
        ? Math.round(
            total(current.map((t) => Math.abs(t.amount))) / elapsedShare,
          )
        : null,
  };
}
