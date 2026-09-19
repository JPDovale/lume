import { mean, total } from "../analytics/statistics";
import { forecastPolicy } from "./policy";
import {
  intermittentState,
  loss,
  methodNames,
  predict,
  recentShift,
  repetitionSupported,
  repeatedAnnual,
  robustHistory,
  type ForecastMethod,
} from "./models";
export type ForecastError = {
  targetIndex: number;
  predicted: number;
  actual: number;
  error: number;
};
export function quantile(values: number[], probability: number) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability,
    lo = Math.floor(position),
    hi = Math.ceil(position);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
}
function origins(length: number, horizon: number) {
  const last = length - horizon;
  return Array.from(
    { length: Math.max(0, last - forecastPolicy.minimumTraining + 1) },
    (_, i) => i + forecastPolicy.minimumTraining,
  ).slice(-forecastPolicy.validationOrigins);
}
function fit(values: number[], horizon: number) {
  const intermittent =
    values.length >= 6 &&
    values.filter((v) => v > 0).length < values.length * 0.6;
  const annual = repeatedAnnual(values);
  const candidates: ForecastMethod[] = intermittent
    ? ["weighted", "intermittent"]
    : ["weighted", "recent", "trend"];
  if (annual) candidates.push("seasonal");
  const tests = origins(values.length, horizon);
  const eligibleTests = tests.filter((i) => !annual || i >= 12);
  const evaluated = candidates.map((method) => {
    const errors = eligibleTests.map(
      (i) =>
        values[i + horizon - 1] - predict(method, values.slice(0, i), horizon),
    );
    return { method, error: loss(errors, intermittent) };
  });
  let winner = evaluated[0];
  if (eligibleTests.length >= forecastPolicy.minimumSelectionTests) {
    const best = [...evaluated].sort((a, b) => a.error - b.error)[0];
    if (best.error < winner.error * (1 - forecastPolicy.minimumRelativeGain))
      winner = best;
  }
  const supported = repetitionSupported(values, winner.method === "seasonal");
  return {
    expected: supported
      ? Math.max(0, Math.round(predict(winner.method, values, horizon)))
      : 0,
    method: winner.method,
    supported,
    intermittent,
  };
}
/** Pure reusable engine. Selection and evaluation both use the actual requested horizon. */
export function forecastSeries(input: readonly number[], steps = 1) {
  const values = Array.from(input),
    horizon = Math.max(1, Math.floor(steps));
  if (values.some((v) => !Number.isSafeInteger(v) || v < 0))
    throw new Error("A série deve conter centavos inteiros não negativos.");
  const fitted = fit(values, horizon),
    cleaned = robustHistory(values),
    shift = recentShift(values);
  // Outer rolling origins re-run the entire selection policy. These errors were not used to select that origin's model.
  const errors: ForecastError[] = origins(values.length, horizon).map((i) => {
    const actual = values[i + horizon - 1],
      predicted = fit(values.slice(0, i), horizon).expected;
    return {
      targetIndex: i + horizon - 1,
      predicted,
      actual,
      error: actual - predicted,
    };
  });
  const usable = fitted.supported ? errors : [];
  const rangeAvailable = usable.length >= forecastPolicy.minimumRangeTests;
  const low = rangeAvailable
    ? Math.max(
        0,
        Math.min(
          fitted.expected,
          Math.round(
            fitted.expected +
              quantile(
                usable.map((e) => e.error),
                0.1,
              ),
          ),
        ),
      )
    : null;
  const high = rangeAvailable
    ? Math.max(
        fitted.expected,
        Math.round(
          fitted.expected +
            quantile(
              usable.map((e) => e.error),
              0.9,
            ),
        ),
      )
    : null;
  const sumActual = total(usable.map((e) => e.actual));
  const mae = usable.length
    ? Math.round(mean(usable.map((e) => Math.abs(e.error))))
    : null;
  const scale = mean(values.slice(1).map((v, i) => Math.abs(v - values[i])));
  const state = intermittentState(values);
  return {
    ...fitted,
    low,
    high,
    errors: usable,
    horizon,
    rangeAvailable,
    spread:
      low !== null && high !== null
        ? Math.max(fitted.expected - low, high - fitted.expected)
        : 0,
    level: Math.round(mean(values)),
    trend: fitted.supported ? fitted.expected - Math.round(mean(values)) : 0,
    methodName: fitted.supported
      ? methodNames[fitted.method]
      : "Sem padrão de repetição",
    observations: values.length,
    backtestMonths: usable.length,
    mae,
    wape:
      usable.length && sumActual > 0
        ? total(usable.map((e) => Math.abs(e.error))) / sumActual
        : null,
    mase: mae !== null && scale > 0 ? mae / scale : null,
    outlierMonths: fitted.method === "seasonal" ? [] : cleaned.outliers,
    regimeShift: shift.shift && fitted.method === "recent",
    recentLevel: Math.round(shift.recentLevel),
    historicLevel: Math.round(shift.historicLevel),
    activeMonths: values.filter((v) => v > 0).length,
    occurrenceProbability:
      fitted.method === "intermittent" && fitted.supported
        ? state.probability
        : null,
    amountWhenPresent:
      fitted.method === "intermittent" && fitted.supported
        ? Math.round(state.size)
        : null,
  };
}
export interface SeriesForecaster {
  forecast(
    values: readonly number[],
    horizon: number,
  ): ReturnType<typeof forecastSeries>;
}
export const statisticalForecaster: SeriesForecaster = {
  forecast: forecastSeries,
};
