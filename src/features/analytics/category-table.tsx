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
import { palette, maybeMoney, monthLabel } from "./chart-format";
export function CategoryTable({
  analysis,
  selected,
  onSelect,
}: {
  analysis: SpendingAnalysis;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel
      title="Cada categoria, com contexto"
      description="Comparação até o mesmo dia do mês anterior. Selecione uma categoria para investigar."
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[790px]">
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Neste mês</TableHead>
              <TableHead className="text-right">Anterior equivalente</TableHead>
              <TableHead className="text-right">Variação</TableHead>
              <TableHead className="text-right">Próximo mês</TableHead>
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
                  {maybeMoney(c.next.expected)}
                  {c.next.low !== null && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {money(c.next.low)} a {money(c.next.high!)}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="font-normal whitespace-nowrap"
                  >
                    {c.next.quality}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
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
              <dd>{maybeMoney(category.next.expected)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            Valores já registrados podem estar contidos nos padrões ou na parte
            variável; a estimativa elimina essa sobreposição.
          </p>
        </div>
      </div>
    </Panel>
  );
}
