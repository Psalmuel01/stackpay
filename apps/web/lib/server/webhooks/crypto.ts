import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "../api-error";

/**
 * Webhook signing secrets must be recoverable (the server signs with them), so unlike API keys
 * they are encrypted at rest with AES-256-GCM under STACKPAY_WEBHOOK_ENCRYPTION_KEY
 * (32 bytes, base64). Ciphertext format: "v1:" + base64(iv[12] | tag[16] | ciphertext).
 */

function encryptionKey() {
  const raw = process.env.STACKPAY_WEBHOOK_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new ApiError(503, "webhooks_not_configured", "Webhook signing is not configured on this server (STACKPAY_WEBHOOK_ENCRYPTION_KEY).");
  }
  return key;
}

export function generateSigningSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptSecret(value: string) {
  if (!value.startsWith("v1:")) throw new Error("Unsupported secret format.");
  const data = Buffer.from(value.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

/** `X-StackPay-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` */
export function signPayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { header: `t=${timestamp},v1=${signature}`, timestamp, signature };
}

/**
 * Verifies a signature header against the raw request body. Rejects timestamps outside the
 * tolerance (replay protection) and compares in constant time.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300, now = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  const timestamp = Number(parts.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(rawBody, secret, timestamp).signature, "hex");
  const candidates = header.split(",").map((part) => part.trim()).filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  return candidates.some((candidate) => {
    const received = Buffer.from(candidate, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
