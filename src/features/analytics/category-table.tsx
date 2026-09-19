import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SpendingAnalysis } from "@/domain/analytics/spending";
import { money } from "@/domain/model";
import { Panel } from "./shared";
import { palette, monthLabel, forecastLabel, maybeMoney } from "./chart-format";
export function CategoryTable({
  analysis,
  selected,
  onSelect,
}: {
  analysis: SpendingAnalysis;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const next = analysis.future[0];
  const reconciled =
    (next.income.reconciledRecurrences ?? 0) +
    (next.expense.reconciledRecurrences ?? 0);
  const balance =
    next.income.expected !== null && next.expense.expected !== null
      ? next.income.expected - next.expense.expected
      : null;
  return (
    <Panel
      title="Cada categoria, com contexto"
      description="A estimativa de cada categoria compõe o total de gastos. Cenários de variação ficam no detalhe da categoria."
    >
      <div
        className="grid sm:grid-cols-3 gap-3 mb-4"
        aria-label="Contexto da previsão"
      >
        {[
          { label: "Entradas estimadas", value: next.income.expected },
          { label: "Total de gastos estimado", value: next.expense.expected },
          { label: "Entradas menos gastos", value: balance },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">
              {item.label} · {monthLabel(next.month)}
            </p>
            <p
              className={`mt-2 text-lg font-medium tabular-nums ${item.value !== null && item.value < 0 ? "text-warning" : ""}`}
            >
              {maybeMoney(item.value)}
            </p>
          </div>
        ))}
      </div>
      {!!reconciled && (
        <p className="mb-4 text-xs text-muted-foreground">
          Correspondência estimada: lançamentos importados compatíveis com{" "}
          {reconciled} recorrência(s) foram considerados uma única vez na
          previsão.
        </p>
      )}
      <div className="overflow-x-auto">
        <Table className="min-w-[790px]">
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Neste mês</TableHead>
              <TableHead className="text-right">Anterior equivalente</TableHead>
              <TableHead className="text-right">Variação</TableHead>
              <TableHead className="text-right">
                Estimativa · {monthLabel(next.month)}
              </TableHead>
              <TableHead>Base da previsão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.categories.map((c, i) => (
              <TableRow
                key={c.id}
                className={selected === c.id ? "bg-accent" : ""}
              >
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(c.id)}
                    className="justify-start px-0"
                  >
                    <i
                      className="size-2 rounded-full"
                      style={{ background: palette[i % palette.length] }}
                    />
                    {c.name}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    {c.count} lançamentos · {c.share.toFixed(0)}% do mês
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(c.actual)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {money(c.previous)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${c.change !== null && c.change > 0 ? "text-warning" : "text-muted-foreground"}`}
                >
                  {c.change === null
                    ? "Sem base"
                    : `${c.change > 0 ? "+" : ""}${c.change}%`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {forecastLabel(c.next)}
                  {c.next.expected !== null &&
                    c.next.expected > 0 &&
                    !!next.expense.expected && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {Math.round(
                          (c.next.expected / next.expense.expected) * 100,
                        )}
                        % do total estimado
                      </p>
                    )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="font-normal whitespace-nowrap"
                  >
                    {c.next.quality === "Volátil"
                      ? "Baixa previsibilidade"
                      : c.next.quality}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-secondary/40 font-medium">
              <TableCell colSpan={4}>Total de despesas previsto</TableCell>
              <TableCell className="text-right tabular-nums">
                {forecastLabel(next.expense)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Soma das categorias
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {!analysis.categories.length && (
        <p className="text-center py-10 text-sm text-muted-foreground">
          Não há categorias com gastos no período.
        </p>
      )}
    </Panel>
  );
}
export function CategoryDetail({
  analysis,
  selected,
}: {
  analysis: SpendingAnalysis;
  selected: string;
}) {
  const category = analysis.categories.find((c) => c.id === selected);
  if (!category) return null;
  return (
    <Panel
      title={`Dentro de ${category.name}`}
      description={`${money(category.averageTicket)} por lançamento neste mês · média mensal histórica: ${money(category.average)}`}
    >
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs text-muted-foreground mb-3">
            MAIORES GASTOS DO MÊS
          </h3>
          {!category.transactions.length && (
            <p className="text-sm text-muted-foreground">
              Nenhum gasto neste mês.
            </p>
          )}
          {category.transactions.slice(0, 5).map((t) => (
            <div
              key={t.id}
              className="flex justify-between gap-4 py-3 border-b border-border text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">{t.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.date.split("-").reverse().join("/")}
                </p>
              </div>
              <span className="tabular-nums shrink-0">{money(-t.amount)}</span>
            </div>
          ))}
        </div>
        <div>
          <h3 className="text-xs text-muted-foreground mb-3">
            COMPOSIÇÃO DA PREVISÃO ·{" "}
            {monthLabel(analysis.future[0].month).toUpperCase()}
          </h3>
          {category.next.diagnostics &&
            !category.next.diagnostics.supported && (
              <p className="mb-4 text-sm text-muted-foreground">
                Sem repetição suficiente para projetar gastos variáveis. Apenas
                lançamentos conhecidos e compromissos entram na estimativa.
              </p>
            )}
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                Já registrados + agendamentos
              </dt>
              <dd>{money(category.next.known + category.next.scheduled)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                Padrões mensais estimados
              </dt>
              <dd>{money(category.next.detected)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Parte variável estimada</dt>
              <dd>{money(category.next.variable)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-4">
              <dt>Estimativa total</dt>
              <dd>{forecastLabel(category.next)}</dd>
            </div>
          </dl>
          {category.next.low !== null &&
            category.next.quality !== "Sem padrão" && (
              <details className="mt-4 rounded-lg border border-border p-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  {category.next.quality === "Volátil"
                    ? "Por que a previsão é instável?"
                    : "Ver cenário de variação"}
                </summary>
                <div className="mt-3 space-y-2 text-muted-foreground leading-relaxed">
                  {category.next.quality === "Volátil" && (
                    <p>
                      O histórico tem variações e erros altos demais para
                      apresentar uma faixa provável confiável. A estimativa
                      central também deve ser tratada com cautela.
                    </p>
                  )}
                  <p>
                    Cenário de variação: {money(category.next.low)} a{" "}
                    {money(category.next.high!)}. Esses extremos não são uma
                    previsão provável nem devem ser comparados com a estimativa
                    central do total.
                  </p>
                  <p>
                    O cenário superior do total de despesas é{" "}
                    {maybeMoney(analysis.future[0].expense.high)}. Os extremos
                    por categoria não são somados; cada cenário combina erros
                    dos mesmos meses. O total central é{" "}
                    {maybeMoney(analysis.future[0].expense.expected)}.
                  </p>
                </div>
              </details>
            )}
          {category.next.low === null && (
            <p className="mt-4 text-xs text-muted-foreground">
              Sem observações suficientes para uma faixa de variação confiável
              neste horizonte.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            Valores já registrados podem estar contidos nos padrões ou na parte
            variável; a estimativa elimina essa sobreposição.
          </p>
        </div>
      </div>
    </Panel>
  );
}
