/**
 * Structured, allowlist-friendly logging. One JSON line per event with correlation identifiers
 * (request_id, merchant_id, invoice_id, tx_id, webhook_delivery_id, …). Values under keys that look
 * sensitive are redacted, and only primitives are logged, so payloads, secrets, and customer data
 * never reach logs.
 */
type Level = "info" | "warn" | "error";
type Primitive = string | number | boolean | null | undefined;

const SENSITIVE = /secret|password|token|signature|authorization|cookie|api[_-]?key|email|customer|name$/i;

export function logEvent(event: string, fields: Record<string, Primitive> = {}, level: Level = "info") {
  const line: Record<string, Primitive> = { ts: new Date().toISOString(), level, event };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (SENSITIVE.test(key)) {
      line[key] = "[redacted]";
      continue;
    }
    line[key] = typeof value === "string" && value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }
  const output = JSON.stringify(line);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}
