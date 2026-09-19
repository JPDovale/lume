import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetWorthAnalysis } from "@/domain/analytics/net-worth";
import { money } from "@/domain/model";
import { ChartLegend, EmptyChart, Panel } from "./shared";
import {
  axisStyle,
  chartColors,
  compactMoney,
  monthLabel,
  tooltipStyle,
} from "./chart-format";
export function WealthChart({
  analysis,
  compact = false,
}: {
  analysis: NetWorthAnalysis;
  compact?: boolean;
}) {
  const data = analysis.history.map((p) => ({
    date: p.date,
    actual: p.netWorth,
    expected: null as number | null,
    range: null as [number, number] | null,
  }));
  if (analysis.projection.length && data.length)
    data[data.length - 1] = {
      ...data[data.length - 1],
      expected: analysis.worth,
      range: [analysis.worth, analysis.worth],
    };
  data.push(
    ...analysis.projection.map((p) => ({
      date: p.date,
      actual: null,
      expected: p.expected,
      range:
        p.low !== null && p.high !== null
          ? ([p.low, p.high] as [number, number])
          : null,
    })),
  );
  const last = analysis.projection.at(-1);
  return (
    <Panel
      title="A trajetória do seu patrimônio"
      description="Saldo líquido registrado nas contas. Projeção baseada no fluxo de caixa, sem rentabilidade presumida."
      extra={
        last ? (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              Estimativa · {monthLabel(last.month)}
            </p>
            <p className="text-lg font-medium tabular-nums mt-1">
              {money(last.expected)}
            </p>
          </div>
        ) : undefined
      }
    >
      {!analysis.firstDate ? (
        <EmptyChart text="Registre saldos iniciais e movimentações para acompanhar seu patrimônio." />
      ) : (
        <div
          className={compact ? "chart-height" : "wealth-chart-height"}
          role="img"
          aria-label="Evolução do patrimônio líquido e projeção futura"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 12, right: 10, left: -6, bottom: 4 }}
            >
              <CartesianGrid vertical={false} stroke={chartColors.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={monthLabel}
                axisLine={false}
                tickLine={false}
                tick={axisStyle}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={compactMoney}
                axisLine={false}
                tickLine={false}
                tick={axisStyle}
              />
              <Tooltip
                labelFormatter={(v) => String(v).split("-").reverse().join("/")}
                formatter={(v, name) => [
                  Array.isArray(v)
                    ? `${money(Number(v[0]))} a ${money(Number(v[1]))}`
                    : money(Number(v)),
                  name,
                ]}
                contentStyle={tooltipStyle}
              />
              <ReferenceLine y={0} stroke="#53535a" />
              <ReferenceLine
                x={analysis.history.at(-1)?.date}
                stroke="#65656c"
                strokeDasharray="3 5"
              />
              <Area
                type="linear"
                dataKey="range"
                name="Faixa de cenário"
                fill={chartColors.forecast}
                fillOpacity={0.12}
                stroke="none"
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="actual"
                name="Patrimônio registrado"
                stroke={chartColors.net}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="expected"
                name="Patrimônio estimado"
                stroke={chartColors.forecast}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartLegend
        entries={[
          { color: chartColors.net, label: "Patrimônio registrado" },
          {
            color: chartColors.forecast,
            label: "Estimativa + faixa de cenário",
            dashed: true,
          },
        ]}
      />
      {!analysis.projection.length && analysis.firstDate && (
        <p className="text-xs text-muted-foreground mt-4">
          A projeção requer dois meses completos de referência após o primeiro
          mês observado.
        </p>
      )}
    </Panel>
  );
}
