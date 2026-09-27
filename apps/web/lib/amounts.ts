export type PaymentCurrency = "STX" | "sBTC" | "USDCx";
export function toAtomicAmount(amount: number | string, currency: PaymentCurrency): string {
  if (!["STX", "sBTC", "USDCx"].includes(currency)) throw new Error("Unsupported currency.");
  const decimals = currency === "sBTC" ? 8 : 6;
  const text = String(amount);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || text.length > 100) throw new Error("Invalid payment amount.");
  const fraction = match[2] ?? "";
  const scale = decimals + Number(match[3] ?? 0) - fraction.length;
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 100) throw new Error("Invalid payment precision.");
  let units = BigInt(match[1] + fraction);
  if (scale < 0) {
    const divisor = 10n ** BigInt(-scale);
    if (units % divisor !== 0n) throw new Error(`Amount exceeds ${decimals} decimal places.`);
    units /= divisor;
  } else units *= 10n ** BigInt(scale);
  if (units <= 0n || units > (1n << 128n) - 1n) throw new Error("Amount is outside the supported range.");
  if (typeof amount === "number" && units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Use a decimal string for amounts above the safe numeric range.");
  return units.toString();
}
