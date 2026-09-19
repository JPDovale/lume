import { behaviorAnalysis } from "./behavior";
import type { Ledger, Transaction } from "../model";
import { money } from "../model";
import { atDay, previousMonths, shiftMonth } from "./calendar";
import {
  CashflowForecast,
  categoryKey,
  isFinancial,
  UNCATEGORIZED,
} from "./forecast";
import { mean, median, percentChange, total } from "./statistics";
export type SpendingInsight = {
  id: string;
  categoryId: string | null;
  tone: "warning" | "positive" | "info";
  title: string;
  detail: string;
};
export function spendingAnalysis(
  ledger: Ledger,
  today: string,
  historyLength = 6,
  horizon = 3,
) {
  const month = today.slice(0, 7),
    prior = shiftMonth(month, -1),
    priorCutoff = atDay(prior, Number(today.slice(8)));
  const expenses = ledger.transactions.filter(
    (t) => isFinancial(t) && t.amount < 0 && t.date <= today,
  );
  const amount = (rows: Transaction[]) => total(rows.map((t) => -t.amount));
  const current = expenses.filter((t) => t.date.startsWith(month)),
    previous = expenses.filter(
      (t) => t.date.startsWith(prior) && t.date <= priorCutoff,
    );
  const totalCurrent = amount(current),
    totalPrevious = amount(previous);
  const model = new CashflowForecast(ledger, month);
  const future = Array.from({ length: horizon }, (_, i) =>
    model.month(shiftMonth(month, i + 1)),
  );
  const currentForecast = model.month(month);
  const categories = [
    ...ledger.categories,
    { id: UNCATEGORIZED, name: "Sem categoria" },
  ]
    .map((c) => {
      const rows = expenses.filter((t) => categoryKey(t) === c.id),
        actualRows = current.filter((t) => categoryKey(t) === c.id);
      const actual = amount(actualRows),
        comparison = amount(previous.filter((t) => categoryKey(t) === c.id));
      const completeHistory = model.sampleMonths.map((m) =>
        amount(rows.filter((t) => t.date.startsWith(m))),
      );
      return {
        ...c,
        behavior: behaviorAnalysis(rows, model.sampleMonths, today),
        actual,
        previous: comparison,
        delta: actual - comparison,
        change: percentChange(actual, comparison),
        share: totalCurrent ? (actual / totalCurrent) * 100 : 0,
        average: Math.round(mean(completeHistory)),
        count: actualRows.length,
        averageTicket: actualRows.length
          ? Math.round(actual / actualRows.length)
          : 0,
        next: future[0].categories.find((f) => f.id === c.id)!,
        closing: currentForecast.categories.find((f) => f.id === c.id)!,
        transactions: actualRows.sort((a, b) => a.amount - b.amount),
      };
    })
    .filter(
      (c) =>
        c.actual ||
        c.previous ||
        c.average ||
        c.next.expected ||
        c.next.known ||
        c.next.scheduled,
    );
  categories.sort(
    (a, b) =>
      b.actual - a.actual || (b.next.expected ?? 0) - (a.next.expected ?? 0),
  );
  const firstMonth = expenses.map((t) => t.date.slice(0, 7)).sort()[0];
  const history = [...previousMonths(month, historyLength - 1), month].map(
    (m) => ({
      month: m,
      partial: m === month,
      total:
        firstMonth && m >= firstMonth
          ? amount(expenses.filter((t) => t.date.startsWith(m)))
          : null,
      values: Object.fromEntries(
        categories.map((c) => [
          c.id,
          amount(
            expenses.filter(
              (t) => t.date.startsWith(m) && categoryKey(t) === c.id,
            ),
          ),
        ]),
      ),
    }),
  );
  const insights: SpendingInsight[] = [];
  const changed = [...categories]
    .filter(
      (c) =>
        c.behavior.comparable &&
        Math.abs(c.behavior.recentAverage - c.behavior.previousAverage) >=
          10000,
    )
    .sort(
      (a, b) =>
        Math.abs(b.behavior.recentAverage - b.behavior.previousAverage) -
        Math.abs(a.behavior.recentAverage - a.behavior.previousAverage),
    )
    .slice(0, 2);
  for (const c of changed) {
    const b = c.behavior;
    const increasing = b.recentAverage > b.previousAverage;
    const frequency = Math.abs(b.frequencyImpact) >= Math.abs(b.ticketImpact);
    insights.push({
      id: `behavior:${c.id}`,
      categoryId: c.id,
      tone: increasing ? "warning" : "positive",
      title: `${c.name}: ${increasing ? "aumento" : "queda"} nos últimos três meses`,
      detail: `Média mensal de ${money(b.previousAverage)} para ${money(b.recentAverage)}, comparando dois trimestres completos. A maior contribuição veio ${frequency ? `da frequência (${b.previousCount} → ${b.recentCount} lançamentos/mês)` : `do valor médio (${money(b.previousTicket)} → ${money(b.recentTicket)})`}.`,
    });
  }
  const growing = [...categories]
    .filter(
      (c) =>
        c.previous > 0 &&
        c.change !== null &&
        c.change >= 15 &&
        c.delta >= 10000,
    )
    .sort((a, b) => b.delta - a.delta)[0];
  if (growing)
    insights.push({
      id: "growth",
      categoryId: growing.id,
      tone: "warning",
      title: `${growing.name} subiu ${growing.change}%`,
      detail: `${money(growing.delta)} a mais que no mesmo intervalo do mês anterior (até dia ${priorCutoff.slice(8)}).`,
    });
  const shrinking = [...categories]
    .filter(
      (c) =>
        c.previous > 0 &&
        c.change !== null &&
        c.change <= -15 &&
        c.delta <= -10000,
    )
    .sort((a, b) => a.delta - b.delta)[0];
  if (shrinking)
    insights.push({
      id: "reduction",
      categoryId: shrinking.id,
      tone: "positive",
      title: `${shrinking.name}: ${money(-shrinking.delta)} a menos`,
      detail: `${Math.abs(shrinking.change!)}% abaixo do mesmo intervalo anterior. A comparação usa períodos equivalentes.`,
    });
  for (const c of categories) {
    const past = expenses.filter(
      (t) =>
        t.date < `${month}-01` &&
        model.sampleMonths.includes(t.date.slice(0, 7)) &&
        categoryKey(t) === c.id,
    );
    if (past.length < 5) continue;
    const typical = median(past.map((t) => -t.amount)),
      unusual = c.transactions.find(
        (t) => -t.amount >= Math.max(10000, typical * 2.5),
      );
    if (unusual && typical > 0) {
      insights.push({
        id: `outlier:${c.id}`,
        categoryId: c.id,
        tone: "info",
        title: `Um gasto fora do padrão em ${c.name}`,
        detail: `${unusual.description}: ${money(-unusual.amount)}, frente à mediana de ${money(typical)} por lançamento. Pode ser pontual; confira o detalhe.`,
      });
      break;
    }
  }
  const next = future[0].expense;
  if (next.expected !== null)
    insights.push({
      id: "forecast",
      categoryId: null,
      tone: "info",
      title: `${money(next.expected)} previstos no próximo mês`,
      detail: `${next.low !== null && next.high !== null ? `Cenários empíricos: ${money(next.low)} a ${money(next.high)}.` : "Sem amostra suficiente para estimar uma faixa de variação conjunta."} ${money(next.known + next.scheduled)} em registros e recorrências; ${money(next.detected)} em padrões mensais estimados.`,
    });
  const unclassified = categories.find((c) => c.id === UNCATEGORIZED);
  if (unclassified?.actual)
    insights.push({
      id: "uncategorized",
      categoryId: UNCATEGORIZED,
      tone: "warning",
      title: `${money(unclassified.actual)} sem categoria`,
      detail: `${unclassified.count} lançamentos. Categorizar melhora a leitura dos grupos e a comparação com seu histórico.`,
    });
  if (!insights.length)
    insights.push({
      id: "empty",
      categoryId: null,
      tone: "info",
      title: "Seu histórico dá contexto aos números",
      detail:
        "Com pelo menos dois meses completos de referência, você verá estimativas. Padrões mensais exigem três meses consecutivos.",
    });
  return {
    month,
    priorCutoff,
    actual: totalCurrent,
    previous: totalPrevious,
    change: percentChange(totalCurrent, totalPrevious),
    categories,
    history,
    future,
    currentForecast,
    patterns: model.patterns.filter((p) => p.amount < 0),
    sampleMonths: model.sampleMonths.length,
    insights,
  };
}
export type SpendingAnalysis = ReturnType<typeof spendingAnalysis>;
