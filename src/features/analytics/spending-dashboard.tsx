import { useMemo, useState } from "react";
import { ArrowUpRight, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { money, localToday, type Ledger } from "@/domain/model";
import { spendingAnalysis } from "@/domain/analytics/spending";
import { Metric, Panel, PeriodControls, ForecastMethod } from "./shared";
import { maybeMoney, monthLabel } from "./chart-format";
import { SpendingTimeline, CategoryComposition } from "./spending-charts";
import { CategoryDetail, CategoryTable } from "./category-table";
export function SpendingDashboard({ ledger }: { ledger: Ledger }) {
  const [history, setHistory] = useState(6),
    [horizon, setHorizon] = useState(3),
    [selected, setSelected] = useState("all");
  const today = localToday();
  const analysis = useMemo(
    () => spendingAnalysis(ledger, today, history, horizon),
    [ledger, today, history, horizon],
  );
  const next = analysis.future[0].expense;
  return (
    <div className="space-y-6">
      <PeriodControls
        history={history}
        horizon={horizon}
        onHistory={setHistory}
        onHorizon={setHorizon}
      >
        <label className="field text-xs text-muted-foreground">
          Categoria
          <NativeSelect
            aria-label="Categoria da análise"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <NativeSelectOption value="all">
              Todas as categorias
            </NativeSelectOption>
            {analysis.categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </PeriodControls>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric
          label="Gasto até hoje"
          value={money(analysis.actual)}
          detail="Despesas registradas neste mês"
        />
        <Metric
          label="Variação no mesmo intervalo"
          value={
            analysis.change === null
              ? "Sem comparação"
              : `${analysis.change > 0 ? "+" : ""}${analysis.change}%`
          }
          detail={`${money(analysis.previous)} no mês anterior, até dia ${analysis.priorCutoff.slice(8)}`}
        />
        <Metric
          label="Fechamento deste mês"
          value={maybeMoney(analysis.currentForecast.expense.expected)}
          detail="Realizado + estimativa do que falta"
        />
        <Metric
          label="Próximo mês"
          value={maybeMoney(next.expected)}
          detail={`${analysis.sampleMonths} meses completos de referência`}
          accent
        />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {analysis.insights.slice(0, 3).map((insight) => (
          <Card key={insight.id}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb
                  size={15}
                  className={
                    insight.tone === "warning"
                      ? "text-warning"
                      : "text-muted-foreground"
                  }
                />
                <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
                  {insight.tone === "warning"
                    ? "Vale acompanhar"
                    : insight.tone === "positive"
                      ? "Mudança de hábito"
                      : "Leitura do histórico"}
                </span>
              </div>
              <h2 className="text-sm font-medium leading-relaxed">
                {insight.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {insight.detail}
              </p>
              {insight.categoryId && (
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 text-xs h-auto mt-3"
                  onClick={() => setSelected(insight.categoryId!)}
                >
                  Ver categoria <ArrowUpRight size={12} />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)] gap-6">
        <SpendingTimeline analysis={analysis} categoryId={selected} />
        <CategoryComposition analysis={analysis} onSelect={setSelected} />
      </div>
      <CategoryDetail analysis={analysis} selected={selected} />
      <CategoryTable
        analysis={analysis}
        selected={selected}
        onSelect={setSelected}
      />
      <Panel
        title="Próximos meses, categoria por categoria"
        description="Estimativas incluem compromissos conhecidos. Faixas detalhadas disponíveis na categoria."
      >
        <div className="overflow-x-auto">
          <Table className="min-w-[540px]">
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                {analysis.future.map((f) => (
                  <TableHead key={f.month} className="text-right capitalize">
                    {monthLabel(f.month)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  {analysis.future.map((f) => (
                    <TableCell
                      key={f.month}
                      className="text-right tabular-nums whitespace-nowrap"
                    >
                      {maybeMoney(
                        f.categories.find((v) => v.id === c.id)?.expected ??
                          null,
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="font-medium bg-secondary/40">
                <TableCell>Total previsto</TableCell>
                {analysis.future.map((f) => (
                  <TableCell
                    key={f.month}
                    className="text-right whitespace-nowrap"
                  >
                    {maybeMoney(f.expense.expected)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Panel>
      <Panel
        title="Padrões que se repetem"
        description="Hipóteses detectadas no histórico. Não criam lançamentos nem alteram suas recorrências."
        extra={
          <Badge variant="outline">
            <Sparkles size={12} />
            {analysis.patterns.length} padrões
          </Badge>
        }
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {analysis.patterns.map((p) => (
            <div key={p.key} className="border border-border rounded-lg p-4">
              <div className="flex justify-between gap-3 text-sm">
                <span>{p.description}</span>
                <span className="tabular-nums">{money(-p.amount)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {ledger.categories.find((c) => c.id === p.categoryId)?.name ??
                  "Sem categoria"}{" "}
                · {p.months} meses consecutivos · perto do dia {p.day}
              </p>
            </div>
          ))}
        </div>
        {!analysis.patterns.length && (
          <p className="text-sm text-muted-foreground">
            Nenhum padrão mensal consistente encontrado. Recorrências já
            cadastradas ficam fora desta lista.
          </p>
        )}
      </Panel>
      <ForecastMethod />
    </div>
  );
}
