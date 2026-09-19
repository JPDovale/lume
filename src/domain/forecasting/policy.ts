/** Product/model policy, versioned and explained in docs/calculos.md. */
export const FORECAST_VERSION = "cashflow-v2";
export const forecastPolicy = {
  historyMonths: 36,
  validationOrigins: 12,
  minimumTraining: 3,
  minimumSelectionTests: 3,
  minimumRangeTests: 8,
  minimumRelativeGain: 0.1,
  annualPeriods: 12,
  annualEvidence: 24,
  damping: 0.85,
} as const;
