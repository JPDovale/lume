import { quantile } from "./series";
import { forecastPolicy } from "./policy";
export type Scenario = { month: string; amount: number };
export type Distribution = {
  expected: number;
  scenarios: Scenario[];
  rangeSource: "fixed" | "empirical" | "unavailable";
  low: number | null;
  high: number | null;
};
export const fixedDistribution = (expected: number): Distribution => ({
  expected,
  scenarios: [],
  rangeSource: "fixed",
  low: expected,
  high: expected,
});
export function empiricalDistribution(
  expected: number,
  scenarios: Scenario[],
): Distribution {
  const available = scenarios.length >= forecastPolicy.minimumRangeTests;
  return {
    expected,
    scenarios,
    rangeSource: available ? "empirical" : "unavailable",
    low: available
      ? Math.min(
          expected,
          Math.round(
            quantile(
              scenarios.map((s) => s.amount),
              0.1,
            ),
          ),
        )
      : null,
    high: available
      ? Math.max(
          expected,
          Math.round(
            quantile(
              scenarios.map((s) => s.amount),
              0.9,
            ),
          ),
        )
      : null,
  };
}
/** Pair scenarios by observed month before summing: category co-movement is retained. */
export function combineDistributions(parts: Distribution[]): Distribution {
  const expected = parts.reduce((s, p) => s + p.expected, 0),
    random = parts.filter((p) => p.rangeSource !== "fixed");
  if (!random.length) return fixedDistribution(expected);
  if (random.some((p) => p.rangeSource === "unavailable"))
    return empiricalDistribution(expected, []);
  const maps = random.map(
    (p) => new Map(p.scenarios.map((s) => [s.month, s.amount])),
  );
  const deterministic = parts
    .filter((p) => p.rangeSource === "fixed")
    .reduce((s, p) => s + p.expected, 0);
  const common = [...maps[0].keys()].filter((month) =>
    maps.every((m) => m.has(month)),
  );
  return empiricalDistribution(
    expected,
    common.map((month) => ({
      month,
      amount: deterministic + maps.reduce((s, m) => s + m.get(month)!, 0),
    })),
  );
}
