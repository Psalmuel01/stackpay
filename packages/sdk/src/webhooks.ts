import { createHmac, timingSafeEqual } from "node:crypto";
import { SignatureVerificationError } from "./errors.js";
import type { Event } from "./types.js";

/**
 * Verify StackPay webhook signatures. Always pass the raw request body exactly as received
 * (before JSON parsing), the `X-StackPay-Signature` header, and your endpoint's signing secret.
 *
 *   const event = stackpay.webhooks.constructEvent(rawBody, req.headers["x-stackpay-signature"], secret);
 */
export const DEFAULT_TOLERANCE_SECONDS = 300;

function expectedSignature(payload: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

function parseHeader(header: string) {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === "t") timestamp = Number(value);
    if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}

export function verifySignature(
  payload: string | Uint8Array,
  header: string | string[] | null | undefined,
  secret: string,
  options: { tolerance?: number; now?: number } = {}
): boolean {
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (!headerValue || !secret) return false;
  const body = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
  const { timestamp, signatures } = parseHeader(headerValue);
  if (timestamp === null || !Number.isSafeInteger(timestamp) || !signatures.length) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (options.tolerance ?? DEFAULT_TOLERANCE_SECONDS)) return false;
  const expected = Buffer.from(expectedSignature(body, secret, timestamp), "hex");
  return signatures.some((signature) => {
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export function constructEvent<T = Record<string, unknown>>(
  payload: string | Uint8Array,
  header: string | string[] | null | undefined,
  secret: string,
  options: { tolerance?: number; now?: number } = {}
): Event<T> {
  if (!verifySignature(payload, header, secret, options)) {
    throw new SignatureVerificationError("Webhook signature verification failed. Check the signing secret and that you passed the raw request body.", { type: "signature_verification_error" });
  }
  return JSON.parse(typeof payload === "string" ? payload : new TextDecoder().decode(payload)) as Event<T>;
}

/** Builds a valid signature header, for testing your webhook handler. */
export function generateTestHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${expectedSignature(payload, secret, timestamp)}`;
}
