import { useMemo } from "react";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, localToday, type Ledger } from "@/domain/model";
import { netWorthAnalysis } from "@/domain/analytics/net-worth";
import { spendingAnalysis } from "@/domain/analytics/spending";
import { Metric, Panel } from "./analytics/shared";
import { maybeMoney, palette } from "./analytics/chart-format";
import { WealthChart } from "./analytics/wealth-chart";
export function Dashboard({
  ledger,
  spendingLedger = ledger,
  onNavigate,
}: {
  ledger: Ledger;
  spendingLedger?: Ledger;
  onNavigate: (page: string) => void;
}) {
  const today = localToday();
  const wealth = useMemo(
    () => netWorthAnalysis(ledger, today, 6, 3),
    [ledger, today],
  );
  const spending = useMemo(
    () => spendingAnalysis(spendingLedger, today),
    [spendingLedger, today],
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric
          label="Patrimônio líquido"
          value={money(wealth.worth)}
          detail={`${money(wealth.assets)} em ativos · ${money(wealth.liabilities)} em dívidas`}
          accent
        />
        <Metric
          label="Gasto neste mês"
          value={money(spending.actual)}
          detail={
            spending.change === null
              ? "Ainda sem comparação mensal"
              : `${spending.change > 0 ? "+" : ""}${spending.change}% frente ao mesmo intervalo anterior`
          }
        />
        <Metric
          label="Fechamento de gastos"
          value={maybeMoney(spending.currentForecast.expense.expected)}
          detail="Estimativa para o fim deste mês"
        />
        <Metric
          label="Gastos do próximo mês"
          value={maybeMoney(spending.future[0].expense.expected)}
          detail={`${spending.sampleMonths} meses completos de referência`}
        />
      </div>
      <WealthChart analysis={wealth} compact />
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel
          title="O que merece sua atenção"
          description="Leituras do seu histórico, com os números por trás."
          extra={<Lightbulb size={17} className="text-muted-foreground" />}
        >
          <div className="space-y-5">
            {spending.insights.slice(0, 3).map((i) => (
              <div key={i.id} className="border-l-2 border-border pl-4">
                <h3 className="font-medium text-sm">{i.title}</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {i.detail}
                </p>
              </div>
            ))}
          </div>
          <Button
            className="mt-5 px-0 text-xs"
            size="sm"
            variant="link"
            onClick={() => onNavigate("reports")}
          >
            Explorar gastos e previsões <ArrowUpRight size={14} />
          </Button>
        </Panel>
        <Panel
          title="Categorias em destaque"
          description="Participação nas despesas registradas neste mês."
        >
          <div className="space-y-4">
            {spending.categories
              .filter((c) => c.actual > 0)
              .slice(0, 5)
              .map((c, i) => (
                <div key={c.id}>
                  <div className="flex justify-between gap-4 text-sm mb-2">
                    <span>{c.name}</span>
                    <span className="tabular-nums">
                      {money(c.actual)}{" "}
                      <span className="text-muted-foreground text-xs ml-2">
                        {c.share.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.share}%`, background: palette[i] }}
                    />
                  </div>
                </div>
              ))}
            {!spending.actual && (
              <p className="py-7 text-sm text-muted-foreground">
                As categorias aparecerão após seus primeiros gastos.
              </p>
            )}
          </div>
          <Button
            className="mt-5 px-0 text-xs"
            variant="link"
            size="sm"
            onClick={() => onNavigate("wealth")}
          >
            Ver evolução patrimonial <ArrowUpRight size={14} />
          </Button>
        </Panel>
      </div>
    </div>
  );
}
