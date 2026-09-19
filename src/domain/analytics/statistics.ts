export const total = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0);
export const mean = (values: number[]) =>
  values.length ? total(values) / values.length : 0;
export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2
    : 0;
}
export const deviation = (values: number[]) =>
  Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
export const percentChange = (current: number, previous: number) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
export function estimateSeries(values: number[], steps: number) {
  const weight = (values.length * (values.length + 1)) / 2;
  const level = weight
    ? total(values.map((value, i) => value * (i + 1))) / weight
    : 0;
  // A robust slope needs at least four full months. Extrapolation is capped at 25% of the level.
  const slope =
    values.length >= 4
      ? median(values.slice(1).map((value, i) => value - values[i]))
      : 0;
  const adjustment = Math.max(
    -level * 0.25,
    Math.min(level * 0.25, slope * steps),
  );
  return {
    expected: Math.max(0, Math.round(level + adjustment)),
    spread: Math.round(deviation(values)),
    level: Math.round(level),
    trend: Math.round(adjustment),
  };
}
