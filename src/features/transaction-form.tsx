import { installmentLabel } from "@/domain/recurrence";
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
  initialRule,
  onSave,
}: {
  ledger: Ledger;
  recurring?: boolean;
  initial?: Transaction;
  initialRule?: Recurrence;
  onSave: (value: Transaction | Recurrence) => Promise<void>;
}) {
  const source = initial ?? initialRule;
  const lockedSchedule =
    !!initialRule &&
    ledger.transactions.some((t) => t.recurrenceId === initialRule.id);
  const [ending, setEnding] = useState(
    initialRule?.installmentCount
      ? "count"
      : initialRule?.endDate
        ? "date"
        : "none",
  );
  const [amountMode, setAmountMode] = useState(
    initialRule?.amountMode ?? "exact",
  );
  const pending = initial?.validationStatus === "pending";
  const origin = ledger.recurrences.find((r) => r.id === initial?.recurrenceId);
  const [tags, setTags] = useState(source?.tagIds ?? []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const validating =
      (e.nativeEvent.submitter as HTMLButtonElement | null)?.value ===
      "confirm";
    try {
      const base = {
        id: source?.id ?? crypto.randomUUID(),
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
      const date = lockedSchedule
        ? initialRule!.startDate
        : String(f.get("date"));
      await onSave(
        recurring
          ? {
              ...base,
              startDate: date,
              endDate:
                ending === "date" ? String(f.get("endDate")) || null : null,
              installmentCount:
                ending === "count" ? Number(f.get("installmentCount")) : null,
              amountMode: amountMode as Recurrence["amountMode"],
              frequency: lockedSchedule
                ? initialRule!.frequency
                : (String(f.get("frequency")) as Recurrence["frequency"]),
              active: initialRule?.active ?? true,
            }
          : {
              ...base,
              date,
              recurrenceDate: initial?.recurrenceDate,
              installmentNumber: initial?.installmentNumber,
              installmentTotal: initial?.installmentTotal,
              validationStatus: validating
                ? "confirmed"
                : (initial?.validationStatus ?? "confirmed"),
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
      {initialRule && (
        <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          As alterações valem para novas ocorrências. Valores e validações dos
          lançamentos existentes serão preservados.
          {lockedSchedule
            ? " Início e frequência ficam fixos porque já há parcelas lançadas."
            : ""}
        </p>
      )}
      {origin && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p>
            Recorrência: <strong>{origin.description}</strong> ·{" "}
            {installmentLabel(initial!)}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            As alterações afetam somente este lançamento. O vínculo e a parcela
            são preservados.
          </p>
        </div>
      )}
      {pending && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300">
          Valor aproximado. Confira o valor real e clique em Validar lançamento
          para incluí-lo no realizado.
        </p>
      )}
      <div className="field">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          name="description"
          defaultValue={source?.description}
          placeholder="Ex.: supermercado, aluguel, salário"
          required
          maxLength={300}
        />
      </div>
      {recurring && (
        <div className="field">
          <Label htmlFor="amountMode">Precisão do valor</Label>
          <NativeSelect
            id="amountMode"
            value={amountMode}
            onChange={(e) =>
              setAmountMode(e.target.value as "exact" | "approximate")
            }
          >
            <NativeSelectOption value="exact">Exatamente</NativeSelectOption>
            <NativeSelectOption value="approximate">
              Aproximadamente
            </NativeSelectOption>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            {amountMode === "approximate"
              ? "Cada ocorrência aguardará validação do valor nos lançamentos."
              : "Cada ocorrência será registrada com o valor informado, sem validação pendente."}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <Label htmlFor="amount">Valor (R$)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={
              source
                ? Math.abs(source.amount / 100)
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
            defaultValue={source && source.amount > 0 ? "income" : "expense"}
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
            defaultValue={source?.accountId}
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
            defaultValue={source?.categoryId ?? ""}
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
      <div className={recurring ? "grid sm:grid-cols-2 gap-4" : "grid gap-4"}>
        <div className="field">
          <Label htmlFor="date">
            {recurring ? "Primeiro lançamento" : "Data"}
          </Label>
          <Input
            id="date"
            type="date"
            name="date"
            defaultValue={
              initialRule?.startDate ?? initial?.date ?? localToday()
            }
            disabled={lockedSchedule}
            required
          />
        </div>
        {recurring && (
          <div className="field">
            <Label htmlFor="frequency">Frequência</Label>
            <NativeSelect
              id="frequency"
              name="frequency"
              defaultValue={initialRule?.frequency ?? "monthly"}
              disabled={lockedSchedule}
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
            <Label htmlFor="ending">Término</Label>
            <NativeSelect
              id="ending"
              value={ending}
              onChange={(e) => setEnding(e.target.value)}
            >
              <NativeSelectOption value="none">
                Sem fim definido
              </NativeSelectOption>
              <NativeSelectOption value="date">Em uma data</NativeSelectOption>
              <NativeSelectOption value="count">
                Por número de parcelas
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {ending === "date" && (
            <div className="field">
              <Label htmlFor="endDate">Termina em</Label>
              <Input
                id="endDate"
                type="date"
                name="endDate"
                defaultValue={initialRule?.endDate ?? ""}
                required
              />
            </div>
          )}
          {ending === "count" && (
            <div className="field">
              <Label htmlFor="installmentCount">Número de parcelas</Label>
              <Input
                id="installmentCount"
                type="number"
                name="installmentCount"
                min={1}
                max={1200}
                step={1}
                defaultValue={initialRule?.installmentCount ?? 12}
                required
              />
              <p className="text-xs text-muted-foreground">
                Inclui o primeiro lançamento. O valor informado é por parcela.
              </p>
            </div>
          )}
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
          defaultValue={source?.notes}
          placeholder="Algum detalhe para lembrar?"
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {pending && (
        <Button
          type="submit"
          value="confirm"
          disabled={busy}
          className="w-full"
        >
          Validar lançamento
        </Button>
      )}
      <Button
        type="submit"
        value="save"
        variant={pending ? "outline" : "default"}
        disabled={busy}
        className="w-full"
      >
        {busy
          ? "Salvando…"
          : recurring
            ? initialRule
              ? "Salvar recorrência"
              : "Criar recorrência"
            : initial
              ? "Salvar alterações"
              : "Registrar lançamento"}
      </Button>
    </form>
  );
}
