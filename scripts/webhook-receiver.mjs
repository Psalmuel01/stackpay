#!/usr/bin/env node
// Demo merchant endpoint for StackPay webhooks. It prints every delivery and verifies its signature
// exactly as a real integration should: HMAC-SHA256 over `${timestamp}.${rawBody}` with the
// endpoint's signing secret, compared in constant time, within a five-minute window.
//
// Usage (from the repository root):
//   STACKPAY_WEBHOOK_SECRET=whsec_… npm run webhook:listen       # port 4242
//   PORT=5000 npm run webhook:listen
//
// Locally, register http://localhost:4242/webhooks in Developer → Webhooks; this needs
// STACKPAY_ALLOW_LOCALHOST_WEBHOOKS=true in apps/web/.env.local (development only).
// A deployed StackPay can't reach localhost: expose the port with a tunnel
// (e.g. `cloudflared tunnel --url http://localhost:4242`) and register the https URL instead.

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 4242);
const secret = process.env.STACKPAY_WEBHOOK_SECRET || "";
const TOLERANCE_SECONDS = 300;

function verify(rawBody, header) {
  if (!secret) return { ok: false, reason: "no STACKPAY_WEBHOOK_SECRET set, signature not checked" };
  const parts = Object.fromEntries(String(header || "").split(",").map((part) => part.trim().split("=")));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return { ok: false, reason: "missing or malformed X-StackPay-Signature" };
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside the 5-minute window" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature does not match this secret" };
  return { ok: true, reason: "signature valid" };
}

const seen = new Set();

createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(200, { "content-type": "text/plain" }).end("StackPay demo webhook receiver. POST events here.\n");
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const check = verify(rawBody, request.headers["x-stackpay-signature"]);
    let event = null;
    try {
      event = JSON.parse(rawBody);
    } catch {
      /* printed raw below */
    }
    // Deduplicate on the event id (deliveries are at least once), but only for authentic requests.
    const authentic = check.ok || !secret;
    const duplicate = authentic && event?.id && seen.has(event.id);
    if (authentic && event?.id) seen.add(event.id);

    const time = new Date().toLocaleTimeString();
    console.log(`\n[${time}] ${event?.type ?? "unknown event"}  ${event?.id ?? ""}${duplicate ? "  (duplicate: already handled, ignore)" : ""}`);
    console.log(`  ${check.ok ? "✔" : secret ? "✘" : "•"} ${check.reason}`);
    console.log(`  delivery ${request.headers["x-stackpay-delivery-id"] ?? "-"}`);
    console.log(JSON.stringify(event?.data?.object ?? event ?? rawBody, null, 2).replace(/^/gm, "  "));

    // A real endpoint rejects bad signatures; reply 400 so StackPay records the failure.
    response.writeHead(secret && !check.ok ? 400 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify({ received: true }));
  });
}).listen(port, () => {
  console.log(`StackPay demo webhook receiver on http://localhost:${port}/webhooks`);
  console.log(secret ? "Verifying signatures with STACKPAY_WEBHOOK_SECRET." : "No STACKPAY_WEBHOOK_SECRET set: printing events without verifying them.");
});
