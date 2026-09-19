export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
export const monthEnd = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};
export const atDay = (month: string, day: number) =>
  `${month}-${String(Math.min(day, Number(monthEnd(month).slice(8)))).padStart(2, "0")}`;
export const previousMonths = (month: string, count: number) =>
  Array.from({ length: count }, (_, i) => shiftMonth(month, i - count));
export const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
  Number(to.slice(5, 7)) -
  Number(from.slice(5, 7));
