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
