import { formatDecimalAmount } from "./amounts";

export type Currency = "sBTC" | "STX" | "USDCx";

/** "1,240.5 STX" — exact decimal formatting, never through floating point. */
export function formatCurrencyAmount(amount: number | string, currency: Currency) {
  return `${formatDecimalAmount(amount, currency)} ${currency}`;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "No deadline";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
