import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money, localToday, type Ledger } from "@/domain/model";
export function Organization({
  ledger,
  onChange,
}: {
  ledger: Ledger;
  onChange: (s: Ledger) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
                    className="flex items-center justify-between gap-2 text-sm border-b border-border pb-3"
                  >
                    {kind === "tags" ? (
                      <Badge variant="secondary">#{v.name}</Badge>
                    ) : (
                      <span>{v.name}</span>
                    )}
                    {kind === "accounts" && (
                      <span className="text-muted-foreground tabular-nums">
                        {money(
                          ledger.transactions
                            .filter(
                              (t) =>
                                t.accountId === v.id && t.date <= localToday(),
                            )
                            .reduce((s, t) => s + t.amount, 0),
                        )}
                      </span>
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
