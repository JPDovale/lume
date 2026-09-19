import { mean, median, total } from "../analytics/statistics";
import { forecastPolicy } from "./policy";
export type ForecastMethod =
  "weighted" | "recent" | "trend" | "seasonal" | "intermittent";
export const methodNames: Record<ForecastMethod, string> = {
  weighted: "Histórico ponderado",
  recent: "Nível recente",
  trend: "Tendência robusta amortecida",
  seasonal: "Repetição anual",
  intermittent: "Ocorrência e valor separados",
};
export function robustHistory(values: number[]) {
  const center = median(values),
    mad = median(values.map((v) => Math.abs(v - center))),
    outliers: number[] = [];
  const cleaned = [...values];
  if (
    values.length >= 5 &&
    center > 0 &&
    values.filter((v) => v > 0).length >= values.length * 0.6
  )
    values.forEach((v, i) => {
      const neighbors = values
        .slice(Math.max(0, i - 2), i)
        .concat(values.slice(i + 1, i + 3));
      if (
        v > center + Math.max(4 * mad, center * 1.5) &&
        neighbors.length >= 2 &&
        neighbors.every((n) => n < v / 2)
      ) {
        cleaned[i] = Math.max(center, median(neighbors));
        outliers.push(i);
      }
    });
  return { values: cleaned, outliers };
}
export function repeatedAnnual(values: number[]) {
  return (
    values.length >= forecastPolicy.annualEvidence &&
    values.slice(-12).some((v) => v > 0) &&
    values
      .slice(-12)
      .every((v, i) => v === 0 || values[values.length - 24 + i] > 0)
  );
}
export function repetitionSupported(values: number[], annual = false) {
  return (
    annual ||
    values.slice(-3).filter((v) => v > 0).length >= 2 ||
    values.slice(-6).filter((v) => v > 0).length >= 3
  );
}
/** TSB decomposition: update occurrence probability every period, amount only after an occurrence. */
export function intermittentState(values: number[], alpha = 0.2, beta = 0.2) {
  let probability = values[0] > 0 ? 1 : 0,
    size = 0;
  // Initialize severity on first positive observation only; earlier zeros cannot learn a future amount.
  let initialized = false;
  for (const value of values) {
    probability += beta * ((value > 0 ? 1 : 0) - probability);
    if (value > 0) {
      size = initialized ? size + alpha * (value - size) : value;
      initialized = true;
    }
  }
  return { probability, size, expected: probability * size };
}
export function predict(
  method: ForecastMethod,
  raw: number[],
  horizon: number,
): number {
  if (!raw.length) return 0;
  if (method === "seasonal")
    return raw[raw.length - 12 + ((horizon - 1) % 12)] ?? 0;
  if (method === "intermittent") return intermittentState(raw).expected;
  const values = robustHistory(raw).values,
    recent = values.slice(-12);
  if (method === "weighted")
    return (
      total(recent.map((v, i) => v * (i + 1))) /
      ((recent.length * (recent.length + 1)) / 2)
    );
  if (method === "recent") return median(values.slice(-3));
  const slopes: number[] = [];
  for (let i = 0; i < recent.length; i++)
    for (let j = i + 1; j < recent.length; j++)
      slopes.push((recent[j] - recent[i]) / (j - i));
  const slope = median(slopes),
    intercept = median(recent.map((v, i) => v - slope * i));
  const level = Math.max(0, intercept + slope * (recent.length - 1));
  const phi = forecastPolicy.damping,
    steps = (phi * (1 - phi ** horizon)) / (1 - phi);
  return Math.max(0, level + slope * steps);
}
export function recentShift(values: number[]) {
  const cleaned = robustHistory(values).values,
    recent = cleaned.slice(-3),
    prior = cleaned.slice(-9, -3);
  const recentLevel = median(recent),
    historicLevel = median(prior);
  return {
    recentLevel,
    historicLevel,
    shift:
      prior.length >= 3 &&
      recent.length === 3 &&
      prior.every(
        (v) => Math.abs(v - historicLevel) <= Math.max(1, historicLevel * 0.2),
      ) &&
      recent.every(
        (v) => Math.abs(v - recentLevel) <= Math.max(1, recentLevel * 0.2),
      ) &&
      Math.abs(recentLevel - historicLevel) >
        Math.max(1000, historicLevel * 0.3),
  };
}
export const loss = (errors: number[], intermittent: boolean) =>
  intermittent ? mean(errors.map((e) => e * e)) : mean(errors.map(Math.abs));
