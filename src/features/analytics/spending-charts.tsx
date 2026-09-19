import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { SpendingAnalysis } from "@/domain/analytics/spending";
import { money } from "@/domain/model";
import { Panel, EmptyChart, ChartLegend } from "./shared";
import {
  palette,
  chartColors,
  axisStyle,
  compactMoney,
  monthLabel,
  tooltipStyle,
} from "./chart-format";
export function SpendingTimeline({
  analysis,
  categoryId,
}: {
  analysis: SpendingAnalysis;
  categoryId: string;
}) {
  const category = analysis.categories.find((c) => c.id === categoryId);
  const past = analysis.history.map((point) => ({
    month: point.month,
    actual:
      point.total === null
        ? null
        : category
          ? (point.values[categoryId] ?? 0)
          : point.total,
    expected: null as number | null,
    range: null as [number, number] | null,
  }));
  const current = category?.closing ?? analysis.currentForecast.expense;
  const future = analysis.future.map((point) => {
    const forecast = category
      ? point.categories.find((c) => c.id === categoryId)!
      : point.expense;
    return {
      month: point.month,
      actual: null,
      expected: forecast.expected,
      range:
        forecast.low !== null
          ? ([forecast.low, forecast.high!] as [number, number])
          : null,
    };
  });
  if (past.length)
    past[past.length - 1] = {
      ...past[past.length - 1],
      expected: current.expected,
      range: current.low !== null ? [current.low, current.high!] : null,
    };
  return (
    <Panel
      title={
        category
          ? `Evolução · ${category.name}`
          : "Gastos: de onde você veio, para onde vai"
      }
      description="Realizado até hoje e fechamento estimado do mês atual; próximos meses em tracejado."
      extra={
        <span className="text-xs text-muted-foreground">Valores em R$</span>
      }
    >
      {!analysis.categories.length ? (
        <EmptyChart />
      ) : (
        <div
          className="chart-height"
          role="img"
          aria-label={`Gráfico de gastos realizados e previstos${category ? ` em ${category.name}` : ""}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={[...past, ...future]}
              margin={{ top: 12, right: 8, left: -12, bottom: 4 }}
            >
              <CartesianGrid vertical={false} stroke={chartColors.grid} />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                axisLine={false}
                tickLine={false}
                tick={axisStyle}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={compactMoney}
                axisLine={false}
                tickLine={false}
                tick={axisStyle}
              />
              <Tooltip
                labelFormatter={(v) => monthLabel(String(v))}
                formatter={(v, name) => [
                  Array.isArray(v)
                    ? `${money(Number(v[0]))} a ${money(Number(v[1]))}`
                    : money(Number(v)),
                  name,
                ]}
                contentStyle={tooltipStyle}
              />
              <ReferenceLine
                x={analysis.month}
                stroke="#71717a"
                strokeDasharray="3 5"
              />
              <Area
                type="linear"
                dataKey="range"
                name="Faixa de cenário"
                stroke="none"
                fill={chartColors.forecast}
                fillOpacity={0.1}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="actual"
                name="Realizado"
                stroke={chartColors.expense}
                strokeWidth={2.5}
                dot={{ r: 3, fill: chartColors.expense }}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="expected"
                name="Estimativa"
                stroke={chartColors.forecast}
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: chartColors.forecast }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartLegend
        entries={[
          { color: chartColors.expense, label: "Realizado" },
          {
            color: chartColors.forecast,
            label: "Fechamento / previsão",
            dashed: true,
          },
          { color: "#71717a", label: "Mês atual", dashed: true },
        ]}
      />
    </Panel>
  );
}
export function CategoryComposition({
  analysis,
  onSelect,
}: {
  analysis: SpendingAnalysis;
  onSelect: (id: string) => void;
}) {
  const rows = analysis.categories.filter((c) => c.actual > 0);
  return (
    <Panel
      title="Onde o dinheiro ficou"
      description="Participação de cada categoria nas despesas deste mês."
    >
      {!rows.length ? (
        <EmptyChart text="Ainda não há despesas neste mês." />
      ) : (
        <>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="actual"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={83}
                  paddingAngle={3}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {rows.map((c) => (
                    <Cell
                      key={c.id}
                      fill={
                        palette[analysis.categories.indexOf(c) % palette.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => money(Number(v))}
                  contentStyle={tooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-muted-foreground">Neste mês</span>
              <strong className="text-base mt-1 tabular-nums">
                {money(analysis.actual)}
              </strong>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            {rows.slice(0, 6).map((c) => (
              <button
                key={c.id}
                className="category-legend-row"
                onClick={() => onSelect(c.id)}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <i
                    className="size-2 rounded-full shrink-0"
                    style={{
                      background:
                        palette[
                          analysis.categories.indexOf(c) % palette.length
                        ],
                    }}
                  />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {c.share.toFixed(0)}%
                </span>
              </button>
            ))}
            {rows.length > 6 && (
              <p className="text-xs text-muted-foreground">
                Mais {rows.length - 6} categorias na tabela abaixo.
              </p>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
