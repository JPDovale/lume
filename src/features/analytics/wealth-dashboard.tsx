import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { netWorthAnalysis } from "@/domain/analytics/net-worth";
import {
  EmptyChart,
  ForecastMethod,
  Metric,
  Panel,
  PeriodControls,
} from "./shared";
import {
  axisStyle,
  chartColors,
  compactMoney,
  monthLabel,
  tooltipStyle,
} from "./chart-format";
import { WealthChart } from "./wealth-chart";
export function WealthDashboard({ ledger }: { ledger: Ledger }) {
  const [history, setHistory] = useState(12),
    [horizon, setHorizon] = useState(6);
  const today = localToday();
  const analysis = useMemo(
    () => netWorthAnalysis(ledger, today, history, horizon),
    [ledger, today, history, horizon],
  );
  const maxBalance = Math.max(
    1,
    ...analysis.accounts.map((a) => Math.abs(a.balance)),
  );
  return (
    <div className="space-y-6">
      <PeriodControls
        history={history}
        horizon={horizon}
        onHistory={setHistory}
        onHorizon={setHorizon}
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric
          label="Patrimônio líquido"
          value={money(analysis.worth)}
          detail="Saldos positivos menos saldos devedores"
          accent
        />
        <Metric
          label="Ativos registrados"
          value={money(analysis.assets)}
          detail="Soma das contas com saldo positivo"
        />
        <Metric
          label="Dívidas registradas"
          value={money(analysis.liabilities)}
          detail="Soma dos saldos negativos das contas"
        />
        <Metric
          label="Resultado de caixa do período"
          value={money(analysis.savings)}
          detail={
            analysis.savingRate === null
              ? "Sem receitas para calcular a taxa de retenção"
              : `${analysis.savingRate.toFixed(1)}% das receitas retidas · ${history} meses`
          }
        />
      </div>
      <WealthChart analysis={analysis} />
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel
          title="Quanto ficou a cada mês"
          description="Receitas menos despesas. Saldos iniciais e transferências ficam fora deste resultado."
        >
          {!analysis.firstDate ? (
            <EmptyChart />
          ) : (
            <div
              className="chart-height"
              role="img"
              aria-label="Resultado de caixa mensal"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analysis.history.filter((p) => p.netWorth !== null)}
                  margin={{ top: 12, right: 4, left: -14, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke={chartColors.grid} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    axisLine={false}
                    tickLine={false}
                    tick={axisStyle}
                    minTickGap={25}
                  />
                  <YAxis
                    tickFormatter={compactMoney}
                    axisLine={false}
                    tickLine={false}
                    tick={axisStyle}
                  />
                  <ReferenceLine y={0} stroke="#55555e" />
                  <Tooltip
                    labelFormatter={(v) => monthLabel(String(v))}
                    formatter={(v) => [money(Number(v)), "Resultado de caixa"]}
                    contentStyle={tooltipStyle}
                  />
                  <Bar
                    dataKey="savings"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={30}
                    isAnimationActive={false}
                  >
                    {analysis.history
                      .filter((p) => p.netWorth !== null)
                      .map((p) => (
                        <Cell
                          key={p.month}
                          fill={
                            p.savings >= 0
                              ? chartColors.income
                              : chartColors.expense
                          }
                        />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel
          title="O que explica a mudança"
          description="Reconciliação do saldo anterior ao período com o patrimônio registrado hoje."
        >
          <div className="space-y-4 text-sm">
            {[
              { label: "Saldo anterior ao período", value: analysis.opening },
              { label: "+ Receitas registradas", value: analysis.income },
              { label: "− Despesas registradas", value: -analysis.expenses },
              {
                label: "Saldos iniciais adicionados no período",
                value: analysis.adjustments,
              },
              ...(analysis.transferImpact
                ? [
                    {
                      label: "Efeito líquido de transferências registradas",
                      value: analysis.transferImpact,
                    },
                  ]
                : []),
            ].map((row) => (
              <div key={row.label} className="flex justify-between gap-5">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="tabular-nums whitespace-nowrap">
                  {money(row.value)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-5 font-medium">
              <span>Patrimônio líquido atual</span>
              <span className="tabular-nums">{money(analysis.worth)}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Adicionar o saldo inicial de uma conta muda o patrimônio
              registrado, mas não representa uma receita nem uma economia nova.
            </p>
            {analysis.transferImpact !== 0 && (
              <p className="text-xs text-warning leading-relaxed">
                As transferências registradas não se anulam neste período.
                Confira se as duas pontas foram importadas e se têm datas no
                mesmo período.
              </p>
            )}
          </div>
        </Panel>
      </div>
      <Panel
        title="Composição por conta"
        description="Saldos atuais. Contas negativas reduzem o patrimônio líquido."
        extra={
          <Badge variant="outline" className="font-normal">
            {analysis.accounts.length} contas
          </Badge>
        }
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {analysis.accounts.map((a) => (
            <div key={a.id} className="border border-border rounded-xl p-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-sm font-medium">{a.name}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {a.balance < 0
                      ? "Saldo devedor"
                      : "Saldo disponível registrado"}
                  </p>
                </div>
                <span className="tabular-nums text-sm whitespace-nowrap">
                  {money(a.balance)}
                </span>
              </div>
              <div className="h-1 mt-4 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(Math.abs(a.balance) / maxBalance) * 100}%`,
                    background:
                      a.balance < 0 ? chartColors.expense : chartColors.income,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        {!analysis.accounts.length && (
          <p className="text-sm text-muted-foreground">
            Crie ou importe suas contas para compor este painel.
          </p>
        )}
      </Panel>
      <Panel
        title="Histórico patrimonial"
        description="Fechamento mensal; o mês atual mostra o saldo até hoje."
      >
        <div className="overflow-x-auto">
          <Table className="min-w-[650px]">
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Dívidas</TableHead>
                <TableHead className="text-right">Patrimônio líquido</TableHead>
                <TableHead className="text-right">Resultado de caixa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...analysis.history]
                .reverse()
                .filter((p) => p.netWorth !== null)
                .map((p) => (
                  <TableRow key={p.month}>
                    <TableCell className="capitalize">
                      {monthLabel(p.month)}
                      {p.partial && (
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          até hoje
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.assets!)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.liabilities!)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {money(p.netWorth!)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.savings)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
      <p className="text-xs text-muted-foreground leading-relaxed">
        O patrimônio considera somente valores registrados nas contas. Imóveis,
        investimentos ou outras obrigações sem registro não entram no cálculo. A
        faixa futura acumula cenários de entradas e saídas, incluindo apenas o
        restante estimado do mês atual; não é uma promessa de valorização.
      </p>
      <ForecastMethod />
    </div>
  );
}
