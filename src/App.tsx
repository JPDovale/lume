import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Repeat2,
  Shapes,
  ChartNoAxesCombined,
  Download,
  Plus,
  ArrowUpRight,
  HardDrive,
  Upload,
  Check,
  Menu,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SpendingDashboard } from "@/features/analytics/spending-dashboard";
import { WealthDashboard } from "@/features/analytics/wealth-dashboard";
import { Dashboard } from "@/features/dashboard";
import { Transactions } from "@/features/transactions";
import { TransactionForm } from "@/features/transaction-form";
import { Organization } from "@/features/organization";
import {
  money,
  type Ledger,
  type Transaction,
  type Recurrence,
} from "@/domain/model";
import type { ImportPreview } from "@/application/ports";
import "@/application/api";
const navigation = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "transactions", label: "Lançamentos", icon: ArrowLeftRight },
  { id: "recurrences", label: "Recorrências", icon: Repeat2 },
  { id: "organization", label: "Organização", icon: Shapes },
  { id: "reports", label: "Gastos e previsões", icon: ChartNoAxesCombined },
  { id: "wealth", label: "Patrimônio", icon: Landmark },
];
export default function App() {
  const [ledger, setLedger] = useState<Ledger | null>(null),
    [page, setPage] = useState("overview"),
    [menuOpen, setMenuOpen] = useState(false),
    [modal, setModal] = useState<"transaction" | "recurrence" | null>(null),
    [editing, setEditing] = useState<Transaction | undefined>(),
    [error, setError] = useState(
      window.lume ? "" : "Abra o Lume pelo Electron: npm run dev ou npm start.",
    ),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!window.lume) return;
    let active = true;
    const refresh = () =>
      window.lume
        .snapshot()
        .then((s) => {
          if (active) setLedger(s);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function add(recurring = false) {
    setEditing(undefined);
    setModal(recurring ? "recurrence" : "transaction");
  }
  if (!ledger)
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="space-y-4 text-center">
          <img src="./icon.svg" alt="" className="mx-auto size-14" />
          <h1 className="text-2xl">Lume</h1>
          <p
            role={error ? "alert" : undefined}
            className="text-muted-foreground"
          >
            {error || "Preparando seu espaço…"}
          </p>
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <img src="./icon.svg" alt="" className="size-9" />
          </div>
          <span>
            lume<span className="text-primary">.</span>
          </span>
        </div>
        <p className="sidebar-label">SEU ESPAÇO FINANCEIRO</p>
        <nav className="space-y-1">
          {navigation.map((n) => (
            <Button
              key={n.id}
              variant="ghost"
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {page === n.id && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="import-box">
            <Download size={20} className="text-primary mb-3" />
            <h3>
              Um novo começo.
              <br />
              Com toda a sua história.
            </h3>
            <p>Traga suas contas e lançamentos do Actual Budget.</p>
            <Button
              variant="outline"
              className="w-full mt-4"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setPreview(await window.lume.previewImport()),
                )
              }
            >
              Importar Actual <ArrowUpRight size={14} />
            </Button>
          </div>
          <div className="flex gap-2 items-center text-xs text-muted-foreground mt-6">
            <HardDrive size={14} />
            <span>Local. Pessoal. Seu.</span>
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
        </div>
      </aside>
      <main className="main-content">
        <div className="mobile-topbar">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} />
          </Button>
          <span className="font-semibold text-lg">
            lume<span className="text-primary">.</span>
          </span>
        </div>
        <header className="page-header flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-[.18em] text-muted-foreground mb-3">
              MENOS RUÍDO, MAIS CLAREZA
            </p>
            <h1 className="text-3xl tracking-tight font-medium">
              {navigation.find((n) => n.id === page)?.label}
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              {page === "overview"
                ? "Seu presente em números. Seu futuro em perspectiva."
                : page === "transactions"
                  ? "Cada movimento, no seu lugar."
                  : page === "recurrences"
                    ? "Compromissos que se repetem, sem retrabalho."
                    : page === "wealth"
                      ? "Acompanhe o que você construiu e os caminhos à frente."
                      : page === "organization"
                        ? "Uma estrutura que faz sentido para você."
                        : "Entenda seus hábitos e antecipe os próximos meses."}
            </p>
          </div>
          <div className="header-actions flex gap-2 mt-5">
            <Button
              variant="outline"
              size="icon"
              title="Exportar backup"
              aria-label="Exportar backup"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (await window.lume.exportBackup())
                    setNotice("Backup exportado.");
                })
              }
            >
              <Upload size={16} />
            </Button>
            <Button onClick={() => add(page === "recurrences")}>
              <Plus size={16} />
              {page === "recurrences" ? "Nova recorrência" : "Novo lançamento"}
            </Button>
          </div>
        </header>
        {error && (
          <div
            role="alert"
            className="mb-5 p-4 rounded-lg border border-destructive/30 text-destructive text-sm"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-5 p-3 flex gap-2 text-primary text-sm"
          >
            <Check size={16} />
            {notice}
          </div>
        )}
        {!ledger.accounts.length && (
          <Card className="mb-6 border-primary/25">
            <CardContent className="p-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">Bem-vindo ao Lume</h2>
                <p className="text-muted-foreground text-sm mt-2">
                  Importe seu Actual ou crie sua primeira conta para começar.
                </p>
              </div>
              <Button variant="outline" onClick={() => setPage("organization")}>
                Criar minha conta <ArrowUpRight size={15} />
              </Button>
            </CardContent>
          </Card>
        )}
        {page === "overview" && (
          <Dashboard ledger={ledger} onNavigate={setPage} />
        )}
        {page === "reports" && <SpendingDashboard ledger={ledger} />}
        {page === "wealth" && <WealthDashboard ledger={ledger} />}
        {page === "transactions" && (
          <Transactions
            ledger={ledger}
            onEdit={(t) => {
              setEditing(t);
              setModal("transaction");
            }}
          />
        )}
        {page === "organization" && (
          <Organization ledger={ledger} onChange={setLedger} />
        )}
        {page === "recurrences" && (
          <div className="space-y-4">
            {!ledger.recurrences.length ? (
              <Card>
                <CardContent className="p-16 text-center">
                  <Repeat2 className="mx-auto text-primary mb-5" size={32} />
                  <h2 className="text-xl">Deixe o calendário cuidar disso</h2>
                  <p className="text-muted-foreground text-sm mt-3 mb-6">
                    Aluguel, assinaturas, salário. Cadastre uma vez e acompanhe
                    aqui.
                  </p>
                  <Button onClick={() => add(true)}>
                    Criar primeira recorrência
                  </Button>
                </CardContent>
              </Card>
            ) : (
              ledger.recurrences.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl p-3 bg-secondary">
                        <Repeat2 className="text-primary" size={20} />
                      </div>
                      <div>
                        <h2 className="font-medium">{r.description}</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                          {
                            {
                              weekly: "Semanal",
                              monthly: "Mensal",
                              yearly: "Anual",
                            }[r.frequency]
                          }{" "}
                          · Desde {r.startDate.split("-").reverse().join("/")} ·{" "}
                          {
                            ledger.accounts.find((a) => a.id === r.accountId)
                              ?.name
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                      <span className="tabular-nums">{money(r.amount)}</span>
                      <Badge variant={r.active ? "secondary" : "outline"}>
                        {r.active ? "Ativa" : "Pausada"}
                      </Badge>
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          void run(async () =>
                            setLedger(
                              await window.lume.saveRecurrence({
                                ...r,
                                active: !r.active,
                              }),
                            ),
                          )
                        }
                      >
                        {r.active ? "Pausar" : "Retomar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Ao retomar uma recorrência, os vencimentos desde o início são
              registrados, incluindo o período pausado. Lançamentos já
              registrados são preservados.
            </p>
          </div>
        )}
        <footer className="text-xs text-muted-foreground mt-8 pt-5 border-t border-border flex justify-between">
          <span>Lume · Finanças pessoais</span>
          <span>BRL · Dados salvos neste computador</span>
        </footer>
      </main>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="mobile-navigation">
          <DialogHeader>
            <DialogTitle>Lume</DialogTitle>
            <DialogDescription>Seu espaço financeiro</DialogDescription>
          </DialogHeader>
          <nav className="space-y-2">
            {navigation.map((n) => (
              <Button
                key={n.id}
                variant="ghost"
                className={`nav-item ${page === n.id ? "active" : ""}`}
                onClick={() => {
                  setPage(n.id);
                  setMenuOpen(false);
                }}
              >
                <n.icon size={18} />
                {n.label}
              </Button>
            ))}
          </nav>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              void run(async () =>
                setPreview(await window.lume.previewImport()),
              );
            }}
          >
            <Download size={16} />
            Importar Actual
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {modal === "recurrence"
                ? "Nova recorrência"
                : editing
                  ? "Editar lançamento"
                  : "Novo lançamento"}
            </DialogTitle>
            <DialogDescription>
              {modal === "recurrence"
                ? "Defina o compromisso e sua frequência."
                : "Dê um lugar para este movimento."}
            </DialogDescription>
          </DialogHeader>
          {modal && (
            <TransactionForm
              key={editing?.id ?? modal}
              ledger={ledger}
              recurring={modal === "recurrence"}
              initial={editing}
              onSave={async (value) => {
                setLedger(
                  modal === "recurrence"
                    ? await window.lume.saveRecurrence(value as Recurrence)
                    : await window.lume.saveTransaction(value as Transaction),
                );
                setModal(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Seu histórico está pronto para chegar</DialogTitle>
            <DialogDescription>
              Confira o conteúdo antes de importar.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              <div className="grid grid-cols-3 gap-3 py-4">
                {[
                  [preview.accounts, "contas"],
                  [preview.categories, "categorias"],
                  [preview.transactions, "lançamentos"],
                ].map(([value, label]) => (
                  <div
                    key={String(label)}
                    className="bg-secondary rounded-lg p-4"
                  >
                    <p className="text-2xl">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                {preview.duplicates} lançamentos já presentes serão ignorados.
              </p>
              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-2">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setLedger(await window.lume.confirmImport());
                    setPreview(null);
                    setNotice("Histórico importado com sucesso.");
                  })
                }
              >
                {busy ? "Importando…" : "Confirmar importação"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
