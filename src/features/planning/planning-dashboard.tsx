import { localToday, type Ledger } from "@/domain/model";
import { planId, type PlanConfig } from "@/domain/planning-model";
import { shiftMonth } from "@/domain/analytics/calendar";
import { PlanEditor } from "./plan-editor";
export function PlanningDashboard({
  ledger,
  accountIds,
  onSave,
}: {
  ledger: Ledger;
  accountIds: string[];
  onSave: (config: PlanConfig) => Promise<void>;
}) {
  const today = localToday(),
    month = shiftMonth(today.slice(0, 7), 1),
    id = planId(month, accountIds);
  const saved = ledger.monthlyPlans?.find((p) => p.id === id);
  if (!accountIds.length)
    return (
      <p className="text-muted-foreground">
        Selecione uma conta incluída na análise de gastos para planejar o
        próximo mês.
      </p>
    );
  return (
    <PlanEditor
      key={`${id}:${saved?.updatedAt ?? "new"}`}
      ledger={ledger}
      accountIds={accountIds}
      month={month}
      today={today}
      saved={saved}
      onSave={onSave}
    />
  );
}
