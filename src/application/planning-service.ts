import { planConfigSchema, planId } from "../domain/planning-model";
import { proposePlan, savePlanRecord } from "../domain/planning";
import { shiftMonth } from "../domain/analytics/calendar";
import type { Clock, LedgerRepository } from "./ports";
export class PlanningService {
  private repository: LedgerRepository;
  private clock: Clock;
  constructor(repository: LedgerRepository, clock: Clock) {
    this.repository = repository;
    this.clock = clock;
  }
  save(input: unknown) {
    const config = planConfigSchema.parse(input),
      today = this.clock.today(),
      month = today.slice(0, 7);
    if (config.month !== shiftMonth(month, 1))
      throw new Error("O planejamento é sempre para o próximo mês.");
    const ledger = this.repository.read();
    if (
      new Set(config.accountIds).size !== config.accountIds.length ||
      config.accountIds.some((id) => !ledger.accounts.some((a) => a.id === id))
    )
      throw new Error("Selecione contas válidas, sem duplicação.");
    if (
      new Set(config.categories.map((c) => c.categoryId)).size !==
        config.categories.length ||
      config.categories.some(
        (c) =>
          c.categoryId !== null &&
          !ledger.categories.some((v) => v.id === c.categoryId),
      )
    )
      throw new Error("Selecione categorias válidas, sem duplicação.");
    config.accountIds.sort();
    const proposal = proposePlan(ledger, config, today),
      plan = savePlanRecord(ledger, proposal, today, new Date().toISOString());
    ledger.monthlyPlans = [
      ...(ledger.monthlyPlans ?? []).filter(
        (p) => p.id !== planId(config.month, config.accountIds),
      ),
      plan,
    ];
    this.repository.save(ledger);
    return ledger;
  }
}
