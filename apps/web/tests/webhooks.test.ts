import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), isSupabaseConfigured: () => true }));
vi.mock("../lib/server/supabase-admin", () => db);

import { decryptSecret, encryptSecret, generateSigningSecret, signPayload, verifySignature } from "../lib/server/webhooks/crypto";
import { EgressError, isPublicAddress, postJson, validateEndpointUrl } from "../lib/server/webhooks/egress";
import { createEndpoint, deliverDueWebhooks, eventPayload } from "../lib/server/webhooks/service";

const KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STACKPAY_WEBHOOK_ENCRYPTION_KEY", KEY);
});
afterEach(() => vi.unstubAllEnvs());

describe("signing", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';

  it("verifies its own signatures over the raw body", () => {
    const { header } = signPayload(body, secret, 1_700_000_000);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature(body, header, secret, 300, 1_700_000_100)).toBe(true);
  });

  it("rejects wrong secrets, tampered bodies, stale timestamps, and malformed headers", () => {
    const { header } = signPayload(body, secret, 1_700_000_000);
    expect(verifySignature(body, header, "whsec_other", 300, 1_700_000_000)).toBe(false);
    expect(verifySignature(body + " ", header, secret, 300, 1_700_000_000)).toBe(false);
    expect(verifySignature(body, header, secret, 300, 1_700_000_301)).toBe(false);
    expect(verifySignature(body, "garbage", secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
  });

  it("accepts any matching v1 signature (secret rotation)", () => {
    const { signature } = signPayload(body, secret, 1_700_000_000);
    expect(verifySignature(body, `t=1700000000,v1=${"0".repeat(64)},v1=${signature}`, secret, 300, 1_700_000_000)).toBe(true);
  });
});

describe("secret storage", () => {
  it("encrypts with AES-GCM and detects tampering", () => {
    const secret = generateSigningSecret();
    const stored = encryptSecret(secret);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
    const tampered = "v1:" + Buffer.from(Buffer.from(stored.slice(3), "base64").map((b, i) => (i === 40 ? b ^ 1 : b))).toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("refuses to create endpoints without an encryption key", async () => {
    vi.stubEnv("STACKPAY_WEBHOOK_ENCRYPTION_KEY", "");
    db.selectRows.mockResolvedValue([]);
    await expect(createEndpoint("m1", { url: "https://example.com/hook", description: "", enabled_events: ["*"] }, { type: "wallet", id: "w" })).rejects.toMatchObject({ status: 503 });
    expect(db.insertRow).not.toHaveBeenCalled();
  });

  it("stores only ciphertext and returns the secret once", async () => {
    db.selectRows.mockResolvedValue([]);
    db.insertRow.mockImplementation(async (table: string, row: Record<string, unknown>) => ({ public_id: "we_1", created_at: "2026-10-03T00:00:00Z", ...row }));
    const created = await createEndpoint("m1", { url: "https://example.com/hook", description: "Orders", enabled_events: ["invoice.paid"] }, { type: "wallet", id: "w" });
    expect(created.secret).toMatch(/^whsec_/);
    const stored = db.insertRow.mock.calls.find(([table]) => table === "webhook_endpoints")![1];
    expect(JSON.stringify(stored)).not.toContain(created.secret);
    expect(decryptSecret(stored.secret_ciphertext)).toBe(created.secret);
  });
});

describe("SSRF protection", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it.each([
    "http://example.com/hook",
    "https://localhost/hook",
    "https://user:pass@example.com/hook",
    "https://example.com:8443/hook",
    "https://10.0.0.1/hook",
    "https://[::1]/hook",
    "https://metadata/hook",
    "https://printer.local/hook",
    "not a url",
  ])("rejects %s at registration", (url) => {
    expect(() => validateEndpointUrl(url)).toThrow(EgressError);
  });
  it("never connects to loopback when local webhooks are not allowed", async () => {
    await expect(postJson("http://127.0.0.1:1/hook", "{}", {})).rejects.toBeInstanceOf(EgressError);
  });
});

describe("delivery worker", () => {
  let server: ReturnType<typeof createServer>;
  let received: Array<{ headers: IncomingMessage["headers"]; body: string }>;
  let respond: { status: number; headers?: Record<string, string> };

  beforeEach(async () => {
    vi.stubEnv("STACKPAY_ALLOW_LOCALHOST_WEBHOOKS", "true");
    received = [];
    respond = { status: 200 };
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.writeHead(respond.status, respond.headers ?? {});
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function claimed(secret: string) {
    const port = (server.address() as AddressInfo).port;
    return {
      delivery_id: "d1", delivery_public_id: "whd_1", attempts: 1, endpoint_public_id: "we_1",
      url: `http://localhost:${port}/hook`, secret_ciphertext: encryptSecret(secret),
      event_public_id: "evt_1", event_type: "invoice.paid", event_data: { id: "inv_1", amount: "25" }, event_created_at: "2026-10-03T00:00:00Z",
    };
  }

  it("sends a signed event the merchant can verify, and records success", async () => {
    const secret = generateSigningSecret();
    const delivery = claimed(secret);
    db.callRpc.mockImplementation(async (fn: string) => (fn === "claim_webhook_deliveries" ? [delivery] : "succeeded"));
    expect(await deliverDueWebhooks()).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request.body).toBe(eventPayload(delivery));
    expect(JSON.parse(request.body)).toMatchObject({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: { id: "inv_1" } } });
    expect(verifySignature(request.body, String(request.headers["x-stackpay-signature"]), secret)).toBe(true);
    expect(request.headers).toMatchObject({ "x-stackpay-event-id": "evt_1", "x-stackpay-delivery-id": "whd_1", "content-type": "application/json" });
    expect(db.callRpc).toHaveBeenCalledWith("record_webhook_attempt", expect.objectContaining({ p_delivery_id: "d1", p_success: true, p_response_status: 200 }));
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [404, false],
    [401, false],
  ])("classifies HTTP %i as retryable=%s", async (status, retryable) => {
    respond = { status, headers: status === 429 ? { "Retry-After": "120" } : {} };
    db.callRpc.mockImplementation(async (fn: string) => (fn === "claim_webhook_deliveries" ? [claimed(generateSigningSecret())] : "retry"));
    await deliverDueWebhooks();
    expect(db.callRpc).toHaveBeenCalledWith("record_webhook_attempt", expect.objectContaining({ p_success: false, p_response_status: status, p_retryable: retryable, p_retry_after_seconds: status === 429 ? 120 : null }));
  });

  it("treats a connection failure as retryable", async () => {
    const delivery = { ...claimed(generateSigningSecret()), url: "http://localhost:1/hook" };
    db.callRpc.mockImplementation(async (fn: string) => (fn === "claim_webhook_deliveries" ? [delivery] : "retry"));
    await deliverDueWebhooks();
    expect(db.callRpc).toHaveBeenCalledWith("record_webhook_attempt", expect.objectContaining({ p_success: false, p_retryable: true }));
  });
});
