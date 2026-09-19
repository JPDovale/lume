import type { Ledger } from "../model";
import { sameAccounts } from "../planning-model";
import { mean, median } from "../analytics/statistics";
import { FORECAST_VERSION, forecastPolicy } from "./policy";
import { recurrenceSignature } from "./recurring";
export type ForecastSnapshot = {
  version: string;
  anchor: string;
  horizon: number;
  recurrences: string;
  income: number | null;
  categories: { categoryId: string | null; expected: number | null }[];
};
/** Budget limits are decisions, never observations or forecast targets. */
export function forecastFeedback(
  ledger: Ledger,
  anchor: string,
  horizon: number,
  categoryId: string | null,
  income = false,
) {
  const signature = recurrenceSignature(ledger),
    ids = ledger.accounts.map((a) => a.id);
  const observations = (ledger.planResults ?? [])
    .filter((r) => {
      const f = r.plan.forecast;
      return (
        f?.version === FORECAST_VERSION &&
        f.horizon === horizon &&
        f.recurrences === signature &&
        r.plan.config.month < anchor &&
        r.plan.createdAt.slice(0, 7) < r.plan.config.month &&
        r.actual.pendingCount === 0 &&
        sameAccounts(r.plan.config.accountIds, ids)
      );
    })
    .sort((a, b) => a.plan.config.month.localeCompare(b.plan.config.month))
    .map((r) => {
      const predicted = income
        ? r.plan.forecast!.income
        : r.plan.forecast!.categories.find((c) => c.categoryId === categoryId)
            ?.expected;
      const actual = income
        ? r.actual.income
        : (r.actual.categories.find((c) => c.categoryId === categoryId)
            ?.actual ?? 0);
      return predicted == null ? null : actual - predicted;
    })
    .filter((v): v is number => v !== null)
    .slice(-12);
  if (observations.length < 6)
    return { adjustment: 0, months: observations.length, applied: false };
  const tests = observations
    .slice(3)
    .map((error, i) => ({
      raw: Math.abs(error),
      corrected: Math.abs(error - median(observations.slice(0, i + 3))),
    }));
  const accepted =
    mean(tests.map((t) => t.corrected)) <
    mean(tests.map((t) => t.raw)) * (1 - forecastPolicy.minimumRelativeGain);
  return {
    adjustment: accepted ? Math.round(median(observations)) : 0,
    months: observations.length,
    applied: accepted,
  };
}
