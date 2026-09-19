import { ArrowDownRight, ArrowUpRight, Minus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money } from "@/domain/model";
import type { SpendingAnalysis } from "@/domain/analytics/spending";
import { Panel } from "./shared";
import { monthLabel } from "./chart-format";
const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
const period = (months: { month: string }[]) =>
  months.length
    ? `${monthLabel(months[0].month)} – ${monthLabel(months.at(-1)!.month)}`
    : "Sem período";
type Category = SpendingAnalysis["categories"][number];
function BehaviorCard({
  category: c,
  onSelect,
}: {
  category: Category;
  onSelect?: () => void;
}) {
  const b = c.behavior,
    d = c.next.diagnostics;
  const delta = b.recentAverage - b.previousAverage;
  const direction =
    delta > 0 ? "a mais" : delta < 0 ? "a menos" : "sem mudança";
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const tone =
    delta > 0
      ? "text-warning"
      : delta < 0
        ? "text-sky-300"
        : "text-muted-foreground";
  const max = Math.max(b.previousAverage, b.recentAverage, 1);
  const byFrequency = Math.abs(b.frequencyImpact) > Math.abs(b.ticketImpact);
  const explanation =
    delta === 0
      ? "O gasto médio mensal se manteve estável."
      : byFrequency
        ? `Você registrou ${b.recentCount > b.previousCount ? "mais" : "menos"} lançamentos por mês.`
        : `O valor médio por lançamento ${b.recentTicket > b.previousTicket ? "aumentou" : "diminuiu"}.`;
  return (
    <article
      aria-label={`Comportamento de ${c.name}`}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-background/40"
    >
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{c.name}</h3>
          {b.model.regimeShift && (
            <Badge variant="outline" className="text-[10px] font-normal">
              Novo nível de gasto
            </Badge>
          )}
        </div>
        {b.comparable ? (
          <>
            <div>
              <p
                className={`flex items-center gap-2 text-[26px] leading-tight tracking-tight font-semibold tabular-nums ${tone}`}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {money(Math.abs(delta))}
              </p>
              <p className="mt-1 text-sm font-medium">
                {direction} por mês{" "}
                <span className="text-muted-foreground font-normal">
                  · em média
                  {b.change !== null && delta !== 0
                    ? ` (${b.change > 0 ? "+" : ""}${b.change}%)`
                    : ""}
                </span>
              </p>
            </div>
            <div className="space-y-3" aria-label="Comparação da média mensal">
              {[
                {
                  label: "Antes",
                  value: b.previousAverage,
                  months: b.buckets.slice(-6, -3),
                  color: "bg-muted-foreground/35",
                },
                {
                  label: "Recente",
                  value: b.recentAverage,
                  months: b.buckets.slice(-3),
                  color:
                    delta > 0
                      ? "bg-warning/80"
                      : delta < 0
                        ? "bg-sky-300/75"
                        : "bg-muted-foreground/65",
                },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      {row.label}
                      <span className="block text-[10px] text-muted-foreground">
                        {period(row.months)}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {money(row.value)}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{ width: `${(row.value / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-secondary/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Principal mudança
              </p>
              <p className="mt-1 text-sm leading-relaxed font-medium">
                {explanation}
              </p>
              {delta !== 0 && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {byFrequency
                    ? `${b.previousCount} → ${b.recentCount} lançamentos/mês`
                    : `${money(b.previousTicket)} → ${money(b.recentTicket)} por lançamento`}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="py-3">
            <p className="text-lg font-medium">Ainda falta histórico</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {b.buckets.length} de 6 meses completos disponíveis para comparar
              hábitos.
            </p>
          </div>
        )}
      </div>
      <div className="mt-auto border-t border-border px-5 py-3">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            Ver detalhes e previsão
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-4 pb-2 pt-4">
            {b.comparable && (
              <>
                <div className="space-y-3 text-xs">
                  <h4 className="font-medium">
                    O que compõe a variação mensal
                  </h4>
                  <div className="flex justify-between gap-3">
                    <div>
                      Frequência
                      <span className="block mt-1 text-muted-foreground">
                        {b.previousCount} → {b.recentCount} lançamentos/mês
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {signedMoney(b.frequencyImpact)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <div>
                      Valor por lançamento
                      <span className="block mt-1 text-muted-foreground">
                        {money(b.previousTicket)} → {money(b.recentTicket)}
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {signedMoney(b.ticketImpact)}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    As duas contribuições somam a variação mensal. Descrevem os
                    registros, sem explicar a causa da mudança.
                  </p>
                </div>
                {b.drivers.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-3 text-xs">
                    <h4 className="font-medium">
                      Descrições com maior impacto
                    </h4>
                    {b.drivers.map((driver, i) => (
                      <div key={i} className="flex justify-between gap-3">
                        <span className="min-w-0 break-words">
                          {driver.name}
                          {driver.emerging && (
                            <span className="block text-muted-foreground">
                              Novo nos registros recentes
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {signedMoney(driver.delta)}/mês
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {d && (
              <div className="border-t border-border pt-3 space-y-2 text-xs">
                <p className="font-medium">
                  Previsão variável · {d.methodName}
                </p>
                <p className="text-muted-foreground">
                  {d.observations} meses analisados · {d.activeMonths} com
                  gastos variáveis.
                  {d.regimeShift
                    ? " O nível recente está estável e diferente do histórico anterior."
                    : ""}
                </p>
                {!d.supported && (
                  <p className="text-muted-foreground">
                    Gastos variáveis sem repetição suficiente não são
                    distribuídos pelos próximos meses. Isso não significa que
                    novos gastos não possam ocorrer.
                  </p>
                )}
                {d.mae !== null && d.backtestMonths >= 3 ? (
                  <p className="text-muted-foreground">
                    Erro médio: {money(d.mae)} em {d.backtestMonths} simulações
                    a {d.horizon} mês(es) à frente
                    {d.wape !== null
                      ? ` (${Math.round(d.wape * 100)}% do total observado)`
                      : ""}
                    . Avaliação da parte variável, sem compromissos e padrões
                    mensais.
                  </p>
                ) : d.supported ? (
                  <p className="text-muted-foreground">
                    Ainda não há meses suficientes para comparar os modelos com
                    segurança.
                  </p>
                ) : null}
                {d.intermittent && d.supported && (
                  <p className="text-muted-foreground">
                    Gastos esporádicos: meses sem lançamentos continuam na base
                    para evitar tratar uma ocorrência isolada como compromisso
                    mensal.
                  </p>
                )}
                {d.outlierMonths.length > 0 && (
                  <p className="text-muted-foreground">
                    {d.outlierMonths.length} pico(s) isolado(s) com influência
                    reduzida na previsão; os valores realizados continuam
                    íntegros.
                  </p>
                )}
                {b.pace !== null && (
                  <p className="text-muted-foreground">
                    Se o ritmo de registro habitual se repetir, este mês aponta
                    para {money(b.pace)}. Cenário separado, sem somar novamente
                    à previsão.
                  </p>
                )}
                {b.weekendShare !== null && (
                  <p className="text-muted-foreground">
                    {Math.round(b.weekendShare * 100)}% do gasto recente ocorreu
                    em fins de semana.
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
        {onSelect && (
          <Button
            variant="link"
            className="mt-2 h-auto px-0 text-xs"
            onClick={onSelect}
          >
            Analisar {c.name}
            <ArrowUpRight size={13} />
          </Button>
        )}
      </div>
    </article>
  );
}
export function BehaviorPanel({
  analysis,
  selected,
  onSelect,
}: {
  analysis: SpendingAnalysis;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const categories =
    selected === "all"
      ? [...analysis.categories]
          .sort(
            (a, b) =>
              Number(b.behavior.comparable) - Number(a.behavior.comparable) ||
              Math.abs(b.behavior.recentAverage - b.behavior.previousAverage) -
                Math.abs(a.behavior.recentAverage - a.behavior.previousAverage),
          )
          .slice(0, 3)
      : analysis.categories.filter((c) => c.id === selected);
  return (
    <Panel
      title="O que mudou no seu comportamento"
      description="Compare a média mensal dos últimos três meses completos com os três anteriores."
    >
      {!categories.length && (
        <p className="text-sm text-muted-foreground">
          Registre ou importe seu histórico para identificar mudanças.
        </p>
      )}
      <div
        className={`grid items-start gap-4 ${categories.length > 1 ? "lg:grid-cols-2 xl:grid-cols-3" : "max-w-xl"}`}
      >
        {categories.map((c) => (
          <BehaviorCard
            key={c.id}
            category={c}
            onSelect={selected === "all" ? () => onSelect(c.id) : undefined}
          />
        ))}
      </div>
    </Panel>
  );
}
