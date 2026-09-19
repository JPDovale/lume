import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { money } from "@/domain/model";
import type { PlanResult } from "@/domain/planning-model";
import { Panel, Metric } from "@/features/analytics/shared";
import { monthLabel } from "@/features/analytics/chart-format";
export function PlanResults({ results }: { results: PlanResult[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const result = results.find((r) => r.id === selectedId);
  return (
    <>
      <Panel
        title="Meses encerrados"
        description="Plano salvo e resultado alcançado. Fechamentos são registrados após a virada do mês, ao abrir o app ou durante a atualização automática."
      >
        {!results.length ? (
          <p className="text-sm text-muted-foreground">
            Os resultados dos seus planos aparecerão aqui após o fim de cada
            mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[620px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Meta de sobra</TableHead>
                  <TableHead>Sobra realizada</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...results]
                  .sort((a, b) =>
                    b.plan.config.month.localeCompare(a.plan.config.month),
                  )
                  .map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize">
                        {monthLabel(r.plan.config.month)}
                      </TableCell>
                      <TableCell>
                        {r.plan.config.savingsBps / 100}% ·{" "}
                        {money(r.plan.savingsGoal)}
                      </TableCell>
                      <TableCell>
                        {money(r.actual.savings)}
                        <span className="block text-xs text-muted-foreground">
                          {r.actual.savingsBps === null
                            ? "Sem entradas registradas"
                            : `${(r.actual.savingsBps / 100).toFixed(1)}% das entradas reais`}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.actual.pendingCount
                          ? "Provisório"
                          : r.actual.goalMet
                            ? "Meta atingida"
                            : "Abaixo da meta"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedId(r.id)}
                        >
                          Ver {monthLabel(r.plan.config.month)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
      <Dialog
        open={!!result}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Resultado · {result ? monthLabel(result.plan.config.month) : ""}
            </DialogTitle>
            <DialogDescription>
              {result?.plan.accountNames.join(" · ")} · Plano preservado;
              resultado atualizado conforme os lançamentos.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric
                  label="Entradas realizadas"
                  value={money(result.actual.income)}
                  detail={`Planejado: ${money(result.plan.income)}`}
                />
                <Metric
                  label="Gastos realizados"
                  value={money(result.actual.expense)}
                  detail={`Limite: ${money(result.plan.spendingBudget)}`}
                />
                <Metric
                  label="Sobra realizada"
                  value={money(result.actual.savings)}
                  detail={
                    result.actual.savingsBps === null
                      ? "Percentual indisponível"
                      : `${(result.actual.savingsBps / 100).toFixed(1)}% das entradas reais`
                  }
                />
                <Metric
                  label="Meta sobre a renda real"
                  value={money(result.actual.requiredSavings)}
                  detail={`${result.plan.config.savingsBps / 100}% · meta original: ${money(result.plan.savingsGoal)}`}
                />
              </div>
              {!!result.actual.pendingCount && (
                <p
                  role="status"
                  className="rounded-lg bg-amber-500/10 p-3 text-sm text-warning"
                >
                  Fechamento provisório: {result.actual.pendingCount}{" "}
                  lançamentos pendentes, com{" "}
                  {money(result.actual.pendingExpense)} em despesas ainda não
                  validadas. Este mês não alimenta o aprendizado até a
                  validação.
                </p>
              )}
              <div className="overflow-x-auto">
                <Table className="min-w-[520px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Planejado</TableHead>
                      <TableHead className="text-right">Realizado</TableHead>
                      <TableHead className="text-right">
                        Acima / abaixo
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.actual.categories.map((c) => (
                      <TableRow key={c.categoryId ?? "uncategorized"}>
                        <TableCell>
                          {c.name}
                          {!c.included && (
                            <span className="block text-xs text-warning">
                              Fora do plano
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {money(c.planned)}
                        </TableCell>
                        <TableCell className="text-right">
                          {money(c.actual)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${c.difference > 0 ? "text-warning" : "text-muted-foreground"}`}
                        >
                          {c.difference > 0 ? "+" : ""}
                          {money(c.difference)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Fechado em {result.closedAt.split("-").reverse().join("/")} ·
                Revisão {result.revision} · Atualizado em{" "}
                {result.updatedAt.split("-").reverse().join("/")}. Validações
                tardias e correções do histórico atualizam o resultado sem
                alterar o plano original.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
