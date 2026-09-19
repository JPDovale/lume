import { money } from "@/domain/model";
export const palette = [
  "#8aaef1",
  "#b7a0ec",
  "#e2ad73",
  "#e58e9d",
  "#70bbb8",
  "#c4bb97",
  "#aab4c5",
  "#bc8eaf",
];
export const chartColors = {
  net: "#b5dc83",
  income: "#8aaef1",
  expense: "#e2a38a",
  forecast: "#b7a0ec",
  muted: "#929299",
  grid: "#ffffff0a",
};
export const monthLabel = (month: string) =>
  new Date(`${month.slice(0, 7)}-02T12:00:00Z`)
    .toLocaleDateString("pt-BR", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    })
    .replace(".", "");
export const compactMoney = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value / 100);
export const tooltipStyle = {
  background: "#222225",
  border: "1px solid #3a3a40",
  borderRadius: 10,
  color: "#fafafa",
  fontSize: 12,
};
export const axisStyle = { fill: chartColors.muted, fontSize: 11 };
export const maybeMoney = (value: number | null) =>
  value === null ? "Sem base suficiente" : money(value);
