import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  localToday,
  money,
  type Ledger,
  type Recurrence,
} from "@/domain/model";
import { installmentTotal, occurrenceDate } from "@/domain/recurrence";

export function Recurrences({
  ledger,
  busy,
  selectedId,
  onCreate,
  onToggle,
  onTransactions,
}: {
  ledger: Ledger;
  busy: boolean;
  selectedId: string | null;
  onCreate: () => void;
  onToggle: (rule: Recurrence) => void;
  onTransactions: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {!ledger.recurrences.length ? (
        <div className="rounded-xl border border-border p-10 text-center space-y-4">
          <h2 className="text-xl">Deixe o calendário cuidar disso</h2>
          <p className="text-muted-foreground">
            Cadastre compromissos fixos, estimados ou parcelados.
          </p>
          <Button onClick={onCreate}>Criar primeira recorrência</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recorrência</TableHead>
                <TableHead>Valor por parcela</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Término</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.recurrences.map((rule) => {
                const total = installmentTotal(rule);
                const rows = ledger.transactions.filter(
                  (t) => t.recurrenceId === rule.id,
                );
                const pending = rows.filter(
                  (t) => t.validationStatus === "pending",
                ).length;
                const end = total ? occurrenceDate(rule, total - 1) : null;
                const ended = end !== null && end <= localToday();
                return (
                  <TableRow
                    key={rule.id}
                    className={selectedId === rule.id ? "bg-primary/5" : ""}
                  >
                    <TableCell>
                      <h2 className="font-medium">{rule.description}</h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        {
                          {
                            weekly: "Semanal",
                            monthly: "Mensal",
                            yearly: "Anual",
                          }[rule.frequency]
                        }{" "}
                        ·{" "}
                        {
                          ledger.accounts.find((a) => a.id === rule.accountId)
                            ?.name
                        }
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="tabular-nums">{money(rule.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {rule.amountMode === "approximate"
                          ? "Aproximadamente"
                          : "Exatamente"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>
                        {total
                          ? `${rows.length}/${total} lançadas`
                          : `${rows.length} lançadas · sem limite`}
                      </p>
                      {pending > 0 && (
                        <p className="text-xs text-amber-300">
                          {pending} pendente{pending > 1 ? "s" : ""} de
                          validação
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {end ? end.split("-").reverse().join("/") : "Sem fim"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {!rule.active
                          ? "Pausada"
                          : ended
                            ? "Finalizada"
                            : "Ativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTransactions(rule.id)}
                        >
                          Ver lançamentos
                        </Button>
                        <Button
                          disabled={busy}
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggle(rule)}
                        >
                          {rule.active ? "Pausar" : "Retomar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Ao retomar, os vencimentos desde o início são registrados, incluindo o
        período pausado. Parcelas existentes não são duplicadas. Valores
        aproximados aguardam validação nos lançamentos.
      </p>
    </div>
  );
}
