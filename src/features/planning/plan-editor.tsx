import { useMemo, useState } from "react";
import { Plus, Trash2, Save, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { money, parseMoney, type Ledger } from "@/domain/model";
import {
  buildPlanBasis,
  proposePlan,
  suggestPlanConfig,
} from "@/domain/planning";
import {
  planConfigSchema,
  type MonthlyPlan,
  type PlanConfig,
} from "@/domain/planning-model";
import { Panel } from "@/features/analytics/shared";
const categoryKey = (id: string | null) => id ?? "__uncategorized__";
export function PlanEditor({
  ledger,
  month,
  accountIds,
  today,
  saved,
  onSave,
}: {
  ledger: Ledger;
  month: string;
  accountIds: string[];
  today: string;
  saved?: MonthlyPlan;
  onSave: (config: PlanConfig) => Promise<void>;
}) {
  const [config, setConfig] = useState<PlanConfig>(() =>
    saved
      ? planConfigSchema.parse(saved.config)
      : suggestPlanConfig(ledger, month, accountIds, today),
  );
  const [manual, setManual] = useState(
    saved?.config.incomeOverride != null
      ? (saved.config.incomeOverride / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [adding, setAdding] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let manualError = "",
    override: number | null = null;
  if (manual.trim())
    try {
      override = /^0([,.]0{1,2})?$/.test(manual.trim())
        ? 0
        : parseMoney(manual);
    } catch {
      manualError =
        "Informe um valor como 5000,00 ou deixe em branco para estimar.";
    }
  const effective = useMemo(
    () => ({ ...config, incomeOverride: override }),
    [config, override],
  );
  const basis = useMemo(
    () => buildPlanBasis(ledger, month, accountIds, today),
    [ledger, month, accountIds, today],
  );
  // Always derive the current proposal. Saving preserves a snapshot, never freezes the on-screen calculation.
  const plan = useMemo(
    () => proposePlan(ledger, effective, today, basis),
    [ledger, effective, today, basis],
  );
  const changed =
    !saved ||
    JSON.stringify(plan) !==
      JSON.stringify(
        Object.fromEntries(
          Object.entries(saved).filter(
            ([key]) => !["id", "createdAt", "updatedAt"].includes(key),
          ),
        ),
      );
  const choices = [
    ...ledger.categories,
    { id: "__uncategorized__", name: "Sem categoria" },
  ].filter(
    (c) => !config.categories.some((v) => categoryKey(v.categoryId) === c.id),
  );
  const commitments =
    plan.outsideCommitted +
    plan.allocations.reduce((sum, c) => sum + c.committed, 0);
  const monthName = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const change = (next: PlanConfig) => {
    setConfig(next);
    setError("");
  };
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(effective);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)).replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-border bg-card p-5 sm:p-7"
        aria-label="Resumo do planejamento"
      >
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[.16em] text-muted-foreground">
              Próximo mês
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-medium first-letter:uppercase">
              {monthName}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {plan.accountNames.join(" · ")}
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-2">
            <Button
              disabled={busy || !!manualError || !changed}
              onClick={() => void save()}
            >
              <Save size={15} />
              {busy ? "Salvando…" : "Salvar planejamento"}
            </Button>
            <span role="status" className="text-[11px] text-muted-foreground">
              {changed
                ? "Prévia atualizada automaticamente"
                : "Planejamento salvo"}
            </span>
          </div>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-[1fr_auto_1fr_auto_1.2fr] md:items-center">
          <div>
            <p className="text-xs text-muted-foreground">Entrada prevista</p>
            <p className="mt-2 text-2xl font-medium tabular-nums">
              {money(plan.income)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {plan.incomeSource === "manual"
                ? "Valor informado por você"
                : "Recebimentos e recorrências"}
            </p>
          </div>
          <ArrowRight
            className="hidden md:block text-muted-foreground"
            size={18}
          />
          <div>
            <label
              className="text-xs text-muted-foreground"
              htmlFor="savings-target"
            >
              Quero preservar
            </label>
            <div className="flex items-center gap-2 mt-2">
              <Input
                id="savings-target"
                type="number"
                min="0"
                max="100"
                step="0.1"
                aria-label="Meta de sobra (%)"
                className="w-24 h-10 text-xl! tabular-nums"
                value={config.savingsBps / 100}
                onChange={(e) =>
                  change({
                    ...config,
                    savingsBps: Math.round(
                      Math.max(0, Math.min(100, Number(e.target.value) || 0)) *
                        100,
                    ),
                  })
                }
              />
              <span className="text-lg text-muted-foreground">%</span>
            </div>
            <p className="mt-2 text-sm text-primary tabular-nums">
              {money(plan.savingsGoal)} de sobra
            </p>
          </div>
          <ArrowRight
            className="hidden md:block text-muted-foreground"
            size={18}
          />
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">
              Orçamento para categorias
            </p>
            <p
              className="mt-2 text-3xl sm:text-4xl font-medium tracking-tight tabular-nums"
              data-planning-budget
            >
              {money(plan.spendingBudget)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Entrada menos a sobra desejada
            </p>
          </div>
        </div>
        <div
          className="mt-6 flex h-2 overflow-hidden rounded-full bg-secondary"
          aria-label="Divisão da entrada prevista"
        >
          <div
            className="bg-primary"
            style={{ width: `${plan.config.savingsBps / 100}%` }}
          />
          <div
            className="bg-sky-400/60"
            style={{
              width: `${plan.income ? Math.min(100 - plan.config.savingsBps / 100, (commitments / plan.income) * 100) : 0}%`,
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          <span>
            <span className="text-primary">●</span> Sobra desejada
          </span>
          <span>
            <span className="text-sky-400/70">●</span> {money(commitments)}{" "}
            comprometidos
          </span>
          <span>Reservas definidas por categoria</span>
        </div>
        <details className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Ajustar a entrada prevista
          </summary>
          <label className="field mt-3 max-w-xs">
            Entrada manual (R$), opcional
            <Input
              aria-label="Entrada manual (R$)"
              placeholder="Automática pelo histórico"
              inputMode="decimal"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
          </label>
          <p className="mt-2">
            Deixe em branco para voltar à estimativa automática.
          </p>
        </details>
        {(error || manualError) && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error || manualError}
          </p>
        )}
      </section>
      {saved?.config.categories.some((c) => c.reserveBps === undefined) && (
        <p
          className="rounded-lg border border-border p-3 text-sm text-muted-foreground"
          role="status"
        >
          Este plano usava prioridades. A nova prévia começa com 100% da
          previsão de cada categoria. Revise os percentuais e salve para
          atualizar o plano.
        </p>
      )}
      {!!plan.alerts.length && (
        <div className="space-y-2" aria-label="Alertas do planejamento">
          {plan.alerts.map((a) => (
            <p
              key={a.id}
              role={a.level === "critical" ? "alert" : "status"}
              className={`rounded-lg border p-3 text-sm leading-relaxed ${a.level === "critical" ? "border-destructive/30 bg-destructive/5 text-destructive" : a.level === "warning" ? "border-amber-500/25 bg-amber-500/5 text-warning" : "border-border text-muted-foreground"}`}
            >
              {a.message}
            </p>
          ))}
        </div>
      )}
      <Panel
        title="Como distribuir o orçamento"
        description="Escolha quanto reservar da previsão de cada categoria: 50% de R$ 1.000 reserva R$ 500. Compromissos registrados são preservados."
      >
        <div className="mb-5 flex flex-wrap gap-2">
          <NativeSelect
            aria-label="Categoria para adicionar ao plano"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <NativeSelectOption value="">
              Adicionar uma categoria
            </NativeSelectOption>
            {choices.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            disabled={!adding}
            onClick={() => {
              change({
                ...config,
                categories: [
                  ...config.categories,
                  {
                    categoryId: adding === "__uncategorized__" ? null : adding,
                    reserveBps: 10000,
                  },
                ],
              });
              setAdding("");
            }}
          >
            <Plus size={14} />
            Adicionar categoria
          </Button>
        </div>
        <div className="hidden lg:grid grid-cols-[minmax(140px,1.5fr)_1fr_minmax(160px,1.2fr)_1fr_36px] gap-5 border-b border-border pb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Categoria</span>
          <span className="text-right">Previsão de gasto</span>
          <span>Reservar da previsão</span>
          <span className="text-right">Limite planejado</span>
          <span />
        </div>
        <div className="divide-y divide-border">
          {plan.allocations.map((c) => (
            <div
              key={categoryKey(c.categoryId)}
              data-plan-category={c.categoryId ?? "uncategorized"}
              className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(140px,1.5fr)_1fr_minmax(160px,1.2fr)_1fr_36px] items-center gap-x-5 gap-y-4 py-5"
            >
              <div className="min-w-0 col-start-1 row-start-1 lg:col-auto lg:row-auto">
                <h3 className="font-medium text-sm break-words">{c.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.committed
                    ? `${money(c.committed)} comprometidos`
                    : c.seeded
                      ? "Sem previsão disponível"
                      : "Padrão do histórico"}
                </p>
              </div>
              <div className="text-left lg:text-right text-sm col-start-1 row-start-2 lg:col-auto lg:row-auto">
                <span className="block lg:hidden mb-1 text-[10px] text-muted-foreground">
                  Previsão de gasto
                </span>
                {c.seeded ? "Sem base" : money(c.baseline)}
              </div>
              <div className="min-w-0 col-span-2 row-start-3 lg:col-span-1 lg:col-auto lg:row-auto">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground lg:hidden">
                    Reservar da previsão
                  </span>
                  <span
                    className="font-medium text-sm tabular-nums"
                    data-plan-percentage
                  >
                    {(c.reserveBps / 100).toLocaleString("pt-BR", {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </span>
                  <span
                    className="text-xs text-muted-foreground tabular-nums"
                    data-plan-requested
                  >
                    {money(c.requested)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[c.reserveBps / 100]}
                  aria-label={`Reservar da previsão de ${c.name}`}
                  aria-valuetext={`${c.reserveBps / 100}% da previsão, ${money(c.requested)} solicitados. Limite planejado: ${money(c.allocated)}`}
                  onValueChange={(value) =>
                    change({
                      ...config,
                      categories: config.categories.map((v) =>
                        v.categoryId === c.categoryId
                          ? {
                              ...v,
                              reserveBps: Math.round(
                                (Array.isArray(value)
                                  ? value[0]
                                  : (value as number)) * 100,
                              ),
                            }
                          : v,
                      ),
                    })
                  }
                />
                <div
                  className="flex justify-between text-[10px] text-muted-foreground tabular-nums -mt-1"
                  aria-hidden="true"
                >
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
              <div className="text-right col-start-2 row-start-1 lg:col-auto lg:row-auto">
                <span className="block lg:hidden mb-1 text-[10px] text-muted-foreground">
                  Limite planejado
                </span>
                <p className="text-xl font-medium tabular-nums" data-plan-limit>
                  {money(c.allocated)}
                </p>
                {c.allocated > c.requested && (
                  <p className="mt-1 text-[11px] text-sky-300">
                    Mínimo comprometido
                  </p>
                )}
                {c.allocated < c.requested && (
                  <p className="mt-1 text-[11px] text-warning">
                    Ajustado ao orçamento
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {(c.shareBps / 100).toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}
                  % da entrada
                </p>
              </div>
              <Button
                className="justify-self-end col-start-2 row-start-2 lg:col-auto lg:row-auto"
                size="icon"
                variant="ghost"
                aria-label={`Remover ${c.name} do plano`}
                onClick={() =>
                  change({
                    ...config,
                    categories: config.categories.filter(
                      (v) => v.categoryId !== c.categoryId,
                    ),
                  })
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
        {!plan.allocations.length && (
          <p className="py-6 text-sm text-muted-foreground">
            Adicione as categorias que deseja incluir. Sem previsão ou
            compromisso conhecido, a categoria começa sem reserva.
          </p>
        )}
        <div className="mt-2 border-t border-border pt-4 flex flex-wrap justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Total distribuído</span>
          <span className="font-medium tabular-nums">
            {money(plan.allocations.reduce((s, c) => s + c.allocated, 0))}
          </span>
        </div>
        {plan.unallocated > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {money(plan.unallocated)} não reservados, além da sobra desejada.
          </p>
        )}
      </Panel>
      <details className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          <Info size={14} className="inline mr-2" />O que sustenta estes
          valores?
        </summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>
            {plan.sampleMonths} meses contínuos de referência. Recorrências
            exatas entram pelo valor cadastrado; as aproximadas usam ocorrências
            validadas quando há histórico suficiente.
          </p>
          <p>
            As estimativas compartilham o motor de Gastos e previsões. Modelos
            são comparados simulando o horizonte previsto com dados anteriores.
            Gastos isolados não viram compromissos mensais.
          </p>
          <p>
            O slider reserva de 0 a 100% da previsão, sem alterar essa
            estimativa. Compromissos conhecidos são o mínimo preservado. Quando
            as reservas não cabem no orçamento, a parte acima desse mínimo é
            reduzida proporcionalmente. O que não for reservado fica como margem
            extra. O recálculo é automático; salvar registra a versão para
            comparar com o resultado ao final do mês.
          </p>
        </div>
      </details>
    </div>
  );
}
