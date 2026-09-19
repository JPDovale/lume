import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "metric-accent" : ""}>
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="metric-value mt-4 mb-2 font-medium tabular-nums tracking-tight">
          {value}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}
export function Panel({
  title,
  description,
  children,
  extra,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`min-w-0 ${className}`}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap justify-between gap-3 mb-5">
          <div>
            <h2 className="font-medium text-sm sm:text-base">{title}</h2>
            {description && (
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {extra}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
export function PeriodControls({
  history,
  horizon,
  onHistory,
  onHorizon,
  children,
}: {
  history: number;
  horizon: number;
  onHistory: (n: number) => void;
  onHorizon: (n: number) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="field text-xs text-muted-foreground">
          Histórico
          <NativeSelect
            aria-label="Período do histórico"
            value={history}
            onChange={(e) => onHistory(Number(e.target.value))}
          >
            {[6, 12, 24].map((n) => (
              <NativeSelectOption key={n} value={n}>
                {n} meses
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="field text-xs text-muted-foreground">
          Projeção
          <NativeSelect
            aria-label="Horizonte da projeção"
            value={horizon}
            onChange={(e) => onHorizon(Number(e.target.value))}
          >
            {[3, 6, 12].map((n) => (
              <NativeSelectOption key={n} value={n}>
                {n} meses
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {children}
      </div>
      <Badge variant="outline" className="h-fit font-normal">
        Mês atual em andamento
      </Badge>
    </div>
  );
}
export function ChartLegend({
  entries,
}: {
  entries: { color: string; label: string; dashed?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-xs text-muted-foreground">
      {entries.map((e) => (
        <span className="flex items-center gap-2" key={e.label}>
          <span
            className={`w-4 border-t-2 ${e.dashed ? "border-dashed" : ""}`}
            style={{ borderColor: e.color }}
          />
          {e.label}
        </span>
      ))}
    </div>
  );
}
export function EmptyChart({
  text = "Seu histórico aparecerá aqui quando houver lançamentos.",
}: {
  text?: string;
}) {
  return (
    <div className="h-52 grid place-items-center text-center text-sm text-muted-foreground px-6">
      {text}
    </div>
  );
}

export function ForecastMethod() {
  return (
    <details className="method-note">
      <summary>Como estas estimativas são calculadas?</summary>
      <div className="space-y-2 mt-3">
        <p>
          Método: média ponderada de até seis meses completos, com mais peso nos
          meses recentes. O primeiro mês observado é excluído por poder estar
          incompleto. São necessários dois meses de referência; uma tendência
          limitada a 25% só é aplicada a partir de quatro meses.
        </p>
        <p>
          Compromissos cadastrados e padrões mensais são separados da parte
          variável. Gastos variáveis já registrados no mês são um piso para a
          previsão, sem serem somados novamente à média. O fechamento do mês
          nunca fica abaixo do que já foi registrado.
        </p>
        <p>
          Padrões detectados exigem três meses consecutivos, um lançamento por
          mês, mesma conta/categoria/descrição, datas próximas e valores pouco
          variáveis. São hipóteses, não agendamentos. Não criam lançamentos. Uma
          recorrência cadastrada com a mesma identificação substitui essa
          hipótese.
        </p>
        <p>
          A faixa usa a dispersão histórica e uma margem de 12% para padrões
          detectados. É um cenário de variação, sem probabilidade garantida. Não
          modela inflação, sazonalidade anual ou rentabilidade. Transferências e
          saldos iniciais ficam fora do fluxo de gastos e receitas.
        </p>
      </div>
    </details>
  );
}
