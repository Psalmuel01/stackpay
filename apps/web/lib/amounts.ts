export type PaymentCurrency = "STX" | "sBTC" | "USDCx";

/** Number of on-chain base units per whole token, as a power of ten. */
export const currencyDecimals: Record<PaymentCurrency, number> = { STX: 6, sBTC: 8, USDCx: 6 };

const MAX_UINT128 = (1n << 128n) - 1n;

function decimalsFor(currency: PaymentCurrency) {
  const decimals = currencyDecimals[currency];
  if (decimals === undefined) throw new Error("Unsupported currency.");
  return decimals;
}

export function toAtomicAmount(amount: number | string, currency: PaymentCurrency): string {
  if (!["STX", "sBTC", "USDCx"].includes(currency)) throw new Error("Unsupported currency.");
  const decimals = decimalsFor(currency);
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
  if (units <= 0n || units > MAX_UINT128) throw new Error("Amount is outside the supported range.");
  if (typeof amount === "number" && units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Use a decimal string for amounts above the safe numeric range.");
  return units.toString();
}

/** Parses a non-negative integer count of base units (as read from the chain or the database). */
export function parseAtomicUnits(value: unknown): bigint | null {
  const text = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d{1,40}$/.test(text)) return null;
  const units = BigInt(text);
  return units <= MAX_UINT128 ? units : null;
}

/** Exact base units → canonical decimal string without trailing zeros ("1.5", "0", "12"). */
export function atomicToDecimal(units: bigint | string, currency: PaymentCurrency): string {
  const parsed = typeof units === "bigint" ? units : parseAtomicUnits(units);
  if (parsed === null || parsed < 0n) throw new Error("Invalid base-unit amount.");
  const decimals = decimalsFor(currency);
  const scale = 10n ** BigInt(decimals);
  const whole = parsed / scale;
  const fraction = (parsed % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Decimal amount (as stored in the database or entered by a person) → exact base units.
 * Unlike toAtomicAmount, zero is allowed; anything malformed or over-precise throws.
 */
export function decimalToAtomic(amount: number | string, currency: PaymentCurrency): bigint {
  const text = String(amount).trim();
  if (/^0+(?:\.0+)?$/.test(text)) return 0n;
  return BigInt(toAtomicAmount(text, currency));
}

/** Exact sum of decimal amounts in one currency, returned as a decimal string. */
export function sumDecimalAmounts(values: Array<number | string>, currency: PaymentCurrency): string {
  const total = values.reduce<bigint>((sum, value) => sum + decimalToAtomic(value, currency), 0n);
  return atomicToDecimal(total, currency);
}

/** Groups the whole part of a decimal string for display without converting through floating point. */
export function formatDecimalAmount(amount: number | string, currency: PaymentCurrency): string {
  let decimal: string;
  try {
    decimal = atomicToDecimal(decimalToAtomic(amount, currency), currency);
  } catch {
    return String(amount);
  }
  const [whole, fraction] = decimal.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
