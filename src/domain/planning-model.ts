import type { ForecastSnapshot } from "./forecasting/feedback";
import { z } from "zod";
export const planConfigSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  accountIds: z.array(z.string().min(1)).min(1),
  savingsBps: z.number().int().min(0).max(10000),
  incomeOverride: z.number().int().safe().min(0).nullable(),
  categories: z.array(
    z.object({
      categoryId: z.string().nullable(),
      // Legacy plans had priorities; the editable proposal starts at the full forecast.
      reserveBps: z.number().int().min(0).max(10000).default(10000),
    }),
  ),
});
export type PlanConfig = z.infer<typeof planConfigSchema>;
export type PlanAllocation = {
  categoryId: string | null;
  name: string;
  reserveBps: number;
  requested: number;
  baseline: number;
  allocated: number;
  committed: number;
  shareBps: number;
  learnedMonths: number;
  historicalOverruns: number;
  seeded: boolean;
};
export type PlanAlert = {
  id: string;
  level: "info" | "warning" | "critical";
  message: string;
};
export type PlanProposal = {
  forecast?: ForecastSnapshot;
  config: PlanConfig;
  accountNames: string[];
  income: number;
  incomeSource: "manual" | "history" | "known";
  savingsGoal: number;
  spendingBudget: number;
  allocations: PlanAllocation[];
  outsideCommitted: number;
  unallocated: number;
  sampleMonths: number;
  alerts: PlanAlert[];
};
export type MonthlyPlan = PlanProposal & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export type PlanActuals = {
  income: number;
  expense: number;
  savings: number;
  savingsBps: number | null;
  requiredSavings: number;
  goalMet: boolean;
  pendingCount: number;
  pendingExpense: number;
  categories: {
    categoryId: string | null;
    name: string;
    planned: number;
    actual: number;
    difference: number;
    included: boolean;
  }[];
};
export type PlanResult = {
  id: string;
  plan: MonthlyPlan;
  actual: PlanActuals;
  closedAt: string;
  updatedAt: string;
  revision: number;
};
export const planId = (month: string, accountIds: string[]) =>
  JSON.stringify([month, [...new Set(accountIds)].sort()]);
export const sameAccounts = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
