/** Wallets may return a bare hash; the chain API uses a 0x-prefixed hash. */
export function normalizeTransactionId(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-f]{64}$/i.test(value)) return null;
  return `0x${value.replace(/^0x/i, "").toLowerCase()}`;
}
