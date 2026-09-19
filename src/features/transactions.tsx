import { useState } from "react";
import { Search, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { installmentLabel } from "@/domain/recurrence";
import { money, type Ledger, type Transaction } from "@/domain/model";
export function Transactions({
  ledger,
  onEdit,
  recurrenceFilter,
  onRecurrenceFilter,
  onOpenRecurrence,
}: {
  ledger: Ledger;
  recurrenceFilter: string | null;
  onRecurrenceFilter: (id: string | null) => void;
  onOpenRecurrence: (id: string) => void;
  onEdit: (t: Transaction) => void;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [tag, setTag] = useState("all"),
    [month, setMonth] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0);
  const rows = ledger.transactions
    .filter(
      (t) =>
        (!recurrenceFilter || t.recurrenceId === recurrenceFilter) &&
        (status === "all" ||
          (status === "pending"
            ? t.validationStatus === "pending"
            : t.validationStatus !== "pending")) &&
        (!month || t.date.startsWith(month)) &&
        (category === "all" || (t.categoryId ?? "") === category) &&
        (tag === "all" || t.tagIds.includes(tag)) &&
        `${t.description} ${t.notes}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {
          ledger.transactions.filter((t) => t.validationStatus === "pending")
            .length
        }{" "}
        pendentes de validação. Valores pendentes entram nas previsões, mas não
        no realizado.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search
            className="absolute left-3 top-3 text-muted-foreground"
            size={16}
          />
          <Input
            aria-label="Buscar lançamentos"
            placeholder="Buscar lançamentos…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Input
          aria-label="Filtrar mês"
          type="month"
          className="w-44"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setPage(0);
          }}
        />
        <NativeSelect
          aria-label="Filtrar situação"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <NativeSelectOption value="all">
            Todas as situações
          </NativeSelectOption>
          <NativeSelectOption value="pending">
            Pendentes de validação
          </NativeSelectOption>
          <NativeSelectOption value="confirmed">Confirmados</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar recorrência"
          value={recurrenceFilter ?? ""}
          onChange={(e) => {
            onRecurrenceFilter(e.target.value || null);
            setPage(0);
          }}
        >
          <NativeSelectOption value="">
            Todas as recorrências e avulsos
          </NativeSelectOption>
          {ledger.recurrences.map((r) => (
            <NativeSelectOption key={r.id} value={r.id}>
              {r.description}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar categoria"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
        >
          <NativeSelectOption value="all">
            Todas as categorias
          </NativeSelectOption>
          <NativeSelectOption value="">Sem categoria</NativeSelectOption>
          {ledger.categories.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar tag"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(0);
          }}
        >
          <NativeSelectOption value="all">Todas as tags</NativeSelectOption>
          {ledger.tags.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria / tags</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(page * 30, page * 30 + 30).map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.description}</p>
                  {(t.transfer || t.recurrenceId || t.openingBalance) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.transfer
                        ? "Transferência"
                        : t.openingBalance
                          ? "Saldo inicial"
                          : installmentLabel(t)}
                    </p>
                  )}
                  {t.recurrenceId && (
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0 h-auto text-xs"
                      onClick={() => onOpenRecurrence(t.recurrenceId!)}
                    >
                      {ledger.recurrences.find((r) => r.id === t.recurrenceId)
                        ?.description ?? "Ver recorrência"}
                    </Button>
                  )}
                  {t.validationStatus === "pending" && (
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className="text-amber-300 border-amber-500/30"
                      >
                        Pendente de validação
                      </Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {ledger.categories.find((c) => c.id === t.categoryId)
                      ?.name ?? "Sem categoria"}
                  </span>
                  <div className="flex gap-1 mt-1">
                    {t.tagIds.map((id) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {ledger.tags.find((t) => t.id === id)?.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {ledger.accounts.find((a) => a.id === t.accountId)?.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.date.split("-").reverse().join("/")}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${t.amount > 0 ? "text-primary" : ""}`}
                >
                  {t.validationStatus === "pending" ? "≈ " : ""}
                  {money(t.amount)}
                </TableCell>
                <TableCell>
                  {t.validationStatus === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(t)}
                      aria-label={`Validar ${t.description}`}
                    >
                      Validar
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${t.description}`}
                    onClick={() => onEdit(t)}
                  >
                    <Pencil size={15} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <p className="text-center text-muted-foreground py-16">
            Nenhum lançamento encontrado.
          </p>
        )}
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>
          {rows.length} lançamentos ·{" "}
          {money(
            rows
              .filter((t) => t.validationStatus !== "pending")
              .reduce((s, t) => s + t.amount, 0),
          )}{" "}
          confirmados
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * 30 >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
