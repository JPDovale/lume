import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  localToday,
  parseMoney,
  type Ledger,
  type Transaction,
  type Recurrence,
} from "@/domain/model";
export function TransactionForm({
  ledger,
  recurring = false,
  initial,
  onSave,
}: {
  ledger: Ledger;
  recurring?: boolean;
  initial?: Transaction;
  onSave: (value: Transaction | Recurrence) => Promise<void>;
}) {
  const [tags, setTags] = useState(initial?.tagIds ?? []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const base = {
        id: initial?.id ?? crypto.randomUUID(),
        description: String(f.get("description")),
        amount:
          parseMoney(String(f.get("amount"))) *
          (f.get("type") === "expense" ? -1 : 1),
        accountId: String(f.get("account")),
        categoryId: String(f.get("category")) || null,
        tagIds: tags,
        notes: String(f.get("notes")),
        recurrenceId: initial?.recurrenceId ?? null,
      };
      const date = String(f.get("date"));
      await onSave(
        recurring
          ? {
              ...base,
              startDate: date,
              endDate: String(f.get("endDate")) || null,
              frequency: String(f.get("frequency")) as Recurrence["frequency"],
              active: true,
            }
          : {
              ...base,
              date,
              transfer: initial?.transfer ?? false,
              openingBalance: initial?.openingBalance ?? false,
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  if (!ledger.accounts.length)
    return (
      <p className="text-muted-foreground">
        Crie uma conta em Organização ou importe seu Actual para começar.
      </p>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="field">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          name="description"
          defaultValue={initial?.description}
          placeholder="Ex.: supermercado, aluguel, salário"
          required
          maxLength={300}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <Label htmlFor="amount">Valor (R$)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={
              initial
                ? Math.abs(initial.amount / 100)
                    .toFixed(2)
                    .replace(".", ",")
                : ""
            }
            placeholder="0,00"
            required
          />
        </div>
        <div className="field">
          <Label htmlFor="type">Tipo</Label>
          <NativeSelect
            id="type"
            name="type"
            defaultValue={initial && initial.amount > 0 ? "income" : "expense"}
          >
            <NativeSelectOption value="expense">Despesa</NativeSelectOption>
            <NativeSelectOption value="income">Receita</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <Label htmlFor="account">Conta</Label>
          <NativeSelect
            id="account"
            name="account"
            defaultValue={initial?.accountId}
          >
            {ledger.accounts.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="field">
          <Label htmlFor="category">Categoria</Label>
          <NativeSelect
            id="category"
            name="category"
            defaultValue={initial?.categoryId ?? ""}
          >
            <NativeSelectOption value="">Sem categoria</NativeSelectOption>
            {ledger.categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <Label htmlFor="date">
            {recurring ? "Primeiro lançamento" : "Data"}
          </Label>
          <Input
            id="date"
            type="date"
            name="date"
            defaultValue={initial?.date ?? localToday()}
            required
          />
        </div>
        {recurring && (
          <div className="field">
            <Label htmlFor="frequency">Frequência</Label>
            <NativeSelect
              id="frequency"
              name="frequency"
              defaultValue="monthly"
            >
              <NativeSelectOption value="weekly">Semanal</NativeSelectOption>
              <NativeSelectOption value="monthly">Mensal</NativeSelectOption>
              <NativeSelectOption value="yearly">Anual</NativeSelectOption>
            </NativeSelect>
          </div>
        )}
      </div>
      {recurring && (
        <>
          <div className="field">
            <Label htmlFor="endDate">Termina em (opcional)</Label>
            <Input id="endDate" type="date" name="endDate" />
          </div>
          <p className="text-xs text-muted-foreground">
            Lançamentos até hoje serão registrados ao salvar. Os próximos serão
            registrados automaticamente quando o app estiver aberto.
          </p>
        </>
      )}
      {ledger.tags.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-4">
            {ledger.tags.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={tags.includes(t.id)}
                  onCheckedChange={(v) =>
                    setTags(
                      v ? [...tags, t.id] : tags.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="field">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={initial?.notes}
          placeholder="Algum detalhe para lembrar?"
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy
          ? "Salvando…"
          : recurring
            ? "Criar recorrência"
            : initial
              ? "Salvar alterações"
              : "Registrar lançamento"}
      </Button>
    </form>
  );
}
