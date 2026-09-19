import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2 } from "lucide-react";
import { NamedEntityDialog, type NamedSelection } from "./named-entity-dialog";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isConfirmed, money, localToday, type Ledger } from "@/domain/model";
export function Organization({
  ledger,
  onChange,
}: {
  ledger: Ledger;
  onChange: (s: Ledger) => void;
}) {
  const [selection, setSelection] = useState<NamedSelection | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function accountSetting(id: string, include?: boolean) {
    setBusy(true);
    setError("");
    try {
      const settings = ledger.settings ?? {
        primaryAccountId: null,
        excludedSpendingAccountIds: [],
      };
      onChange(
        await window.lume.saveSettings(
          include === undefined
            ? { ...settings, primaryAccountId: id }
            : {
                ...settings,
                excludedSpendingAccountIds: include
                  ? settings.excludedSpendingAccountIds.filter((a) => a !== id)
                  : [...settings.excludedSpendingAccountIds, id],
              },
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function create(
    kind: "accounts" | "categories" | "tags",
    form: HTMLFormElement,
  ) {
    const name = String(new FormData(form).get("name"));
    setBusy(true);
    setError("");
    try {
      onChange(
        await window.lume.saveNamed(kind, { id: crypto.randomUUID(), name }),
      );
      form.reset();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {selection && (
        <NamedEntityDialog
          key={`${selection.action}:${selection.entity.id}`}
          selection={selection}
          ledger={ledger}
          onChange={onChange}
          onClose={() => setSelection(null)}
        />
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {(["accounts", "categories", "tags"] as const).map((kind, i) => (
          <Card key={kind}>
            <CardContent className="p-6">
              <h2 className="font-medium mb-2">
                {["Contas", "Categorias", "Tags"][i]}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {
                  [
                    "Onde seu dinheiro está.",
                    "Qual a finalidade do gasto.",
                    "Cruze gastos de categorias diferentes.",
                  ][i]
                }
              </p>
              <form
                className="flex gap-2 mb-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void create(kind, e.currentTarget);
                }}
              >
                <Input
                  name="name"
                  aria-label={`Nova ${["conta", "categoria", "tag"][i]}`}
                  placeholder={
                    [
                      "Ex.: Conta principal",
                      "Ex.: Alimentação",
                      "Ex.: Viagem 2026",
                    ][i]
                  }
                  required
                  maxLength={120}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label={`Adicionar ${["conta", "categoria", "tag"][i]}`}
                  disabled={busy}
                >
                  +
                </Button>
              </form>
              <div className="space-y-3">
                {ledger[kind].map((v) => (
                  <div
                    key={v.id}
                    className={`flex ${kind === "accounts" ? "flex-col items-start" : "items-center justify-between"} gap-2 text-sm border-b border-border pb-3`}
                  >
                    {kind === "tags" ? (
                      <Badge
                        variant="secondary"
                        className="min-w-0 whitespace-normal break-words"
                      >
                        #{v.name}
                      </Badge>
                    ) : (
                      <span className="min-w-0 break-words">{v.name}</span>
                    )}
                    {kind !== "accounts" && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${kind === "categories" ? "categoria" : "tag"} ${v.name}`}
                          onClick={() =>
                            setSelection({ kind, entity: v, action: "edit" })
                          }
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir ${kind === "categories" ? "categoria" : "tag"} ${v.name}`}
                          onClick={() =>
                            setSelection({ kind, entity: v, action: "delete" })
                          }
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    )}
                    {kind === "accounts" && (
                      <div className="space-y-2 w-full">
                        <span className="text-muted-foreground tabular-nums">
                          {money(
                            ledger.transactions
                              .filter(
                                (t) =>
                                  t.accountId === v.id &&
                                  t.date <= localToday() &&
                                  isConfirmed(t),
                              )
                              .reduce((s, t) => s + t.amount, 0),
                          )}
                        </span>
                        <div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              busy || ledger.settings?.primaryAccountId === v.id
                            }
                            onClick={() => void accountSetting(v.id)}
                          >
                            {ledger.settings?.primaryAccountId === v.id
                              ? "Conta principal"
                              : "Definir como principal"}
                          </Button>
                        </div>
                        <label className="flex items-center justify-end gap-2 text-xs">
                          <Checkbox
                            disabled={busy}
                            checked={
                              !ledger.settings?.excludedSpendingAccountIds.includes(
                                v.id,
                              )
                            }
                            onCheckedChange={(include) =>
                              void accountSetting(v.id, include === true)
                            }
                          />
                          <span className="sr-only">{v.name}: </span>
                          Incluir nos gastos e previsões
                        </label>
                      </div>
                    )}
                  </div>
                ))}
                {!ledger[kind].length && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum item por aqui ainda.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
