import { describe, expect, it, vi } from "vitest";
import StackPay, { APIConnectionError, AuthenticationError, IdempotencyError, InvalidRequestError, RateLimitError, SignatureVerificationError } from "../src/index";

const KEY = "sk_test_" + "a".repeat(43);

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_1", ...headers } });
}
function client(fetchImpl: typeof fetch, options: Partial<ConstructorParameters<typeof StackPay>[0]> = {}) {
  return new StackPay({ secretKey: KEY, baseUrl: "https://pay.example.com/", fetch: fetchImpl, ...options });
}

describe("configuration", () => {
  it("requires a secret key", () => {
    expect(() => new StackPay({ secretKey: "pk_nope" })).toThrow(/secret key/);
  });
  it("derives livemode from the key", () => {
    expect(new StackPay({ secretKey: "sk_live_" + "b".repeat(43), fetch: vi.fn() }).livemode).toBe(true);
    expect(client(vi.fn()).livemode).toBe(false);
  });
});

describe("requests", () => {
  it("authenticates and sends exact decimal amounts", async () => {
    const fetch = vi.fn().mockImplementation(async () => reply(201, { id: "inv_1", object: "invoice" }));
    const invoice = await client(fetch).invoices.create({ amount: 25.5, currency: "USDCx", metadata: { orderId: "382" } });
    expect(invoice.id).toBe("inv_1");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://pay.example.com/api/v1/invoices");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers["User-Agent"]).toMatch(/^stackpay-node\//);
    expect(JSON.parse(init.body)).toEqual({ amount: "25.5", currency: "USDCx", metadata: { orderId: "382" } });
  });

  it("adds an idempotency key to every write and reuses it across retries", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("socket hang up")).mockResolvedValueOnce(reply(500, { error: { type: "api_error" } })).mockImplementation(async () => reply(201, { id: "inv_1" }));
    await client(fetch, { maxNetworkRetries: 2 }).invoices.create({ amount: "1", currency: "STX" });
    const keys = fetch.mock.calls.map(([, init]) => init.headers["Idempotency-Key"]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses a caller-supplied idempotency key and never sends one on reads", async () => {
    const fetch = vi.fn().mockImplementation(async () => reply(200, { object: "list", data: [], has_more: false, next_cursor: null }));
    const sdk = client(fetch);
    await sdk.invoices.create({ amount: "1", currency: "STX" }, { idempotencyKey: "order-382" });
    await sdk.invoices.list({ status: "paid", limit: 5 });
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("order-382");
    expect(fetch.mock.calls[1][1].headers["Idempotency-Key"]).toBeUndefined();
    expect(String(fetch.mock.calls[1][0])).toBe("https://pay.example.com/api/v1/invoices?status=paid&limit=5");
  });

  it("retries 429 honouring Retry-After and does not retry client errors", async () => {
    const limited = vi.fn().mockResolvedValueOnce(reply(429, { error: { type: "rate_limit_error" } }, { "retry-after": "0" })).mockImplementation(async () => reply(200, { id: "inv_1" }));
    await client(limited).invoices.retrieve("inv_1");
    expect(limited).toHaveBeenCalledTimes(2);

    const invalid = vi.fn().mockImplementation(async () => reply(400, { error: { type: "invalid_request_error", code: "parameter_invalid", message: "amount is invalid", param: "amount", request_id: "req_9" } }));
    const error = await client(invalid).invoices.create({ amount: "x", currency: "STX" }).catch((e) => e);
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(InvalidRequestError);
    expect(error).toMatchObject({ code: "parameter_invalid", param: "amount", requestId: "req_9", statusCode: 400 });
  });

  it("maps error types", async () => {
    const cases: Array<[string, unknown]> = [["authentication_error", AuthenticationError], ["idempotency_error", IdempotencyError]];
    for (const [type, cls] of cases) {
      const fetch = vi.fn().mockImplementation(async () => reply(type === "authentication_error" ? 401 : 422, { error: { type, message: "x" } }));
      await expect(client(fetch, { maxNetworkRetries: 0 }).invoices.list()).rejects.toBeInstanceOf(cls as never);
    }
    const exhausted = vi.fn().mockImplementation(async () => reply(429, { error: { type: "rate_limit_error" } }, { "retry-after": "0" }));
    await expect(client(exhausted, { maxNetworkRetries: 1 }).invoices.list()).rejects.toBeInstanceOf(RateLimitError);
    expect(exhausted).toHaveBeenCalledTimes(2);
  });

  it("times out as a connection error", async () => {
    const fetch = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    await expect(client(fetch as unknown as typeof globalThis.fetch, { timeout: 10, maxNetworkRetries: 0 }).invoices.list()).rejects.toBeInstanceOf(APIConnectionError);
  });

  it("encodes ids in paths", async () => {
    const fetch = vi.fn().mockImplementation(async () => reply(200, {}));
    await client(fetch).invoices.retrieve("inv_1/../../x");
    expect(String(fetch.mock.calls[0][0])).toBe("https://pay.example.com/api/v1/invoices/inv_1%2F..%2F..%2Fx");
  });
});

describe("pagination", () => {
  it("iterates every page with the cursor", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(200, { object: "list", data: [{ id: "inv_3" }, { id: "inv_2" }], has_more: true, next_cursor: "c1" }))
      .mockResolvedValueOnce(reply(200, { object: "list", data: [{ id: "inv_1" }], has_more: false, next_cursor: null }));
    const ids: string[] = [];
    for await (const invoice of client(fetch).invoices.listAll({ limit: 2 })) ids.push(invoice.id);
    expect(ids).toEqual(["inv_3", "inv_2", "inv_1"]);
    expect(String(fetch.mock.calls[1][0])).toContain("starting_after=c1");
  });
});

describe("webhooks", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: { id: "inv_1" } } });
  const sdk = client(vi.fn());

  it("constructs verified events and rejects tampering", () => {
    const header = sdk.webhooks.generateTestHeader(payload, secret);
    expect(sdk.webhooks.constructEvent(payload, header, secret).type).toBe("invoice.paid");
    expect(() => sdk.webhooks.constructEvent(payload.replace("inv_1", "inv_2"), header, secret)).toThrow(SignatureVerificationError);
    expect(() => sdk.webhooks.constructEvent(payload, header, "whsec_wrong")).toThrow(SignatureVerificationError);
  });

  it("enforces the timestamp tolerance", () => {
    const header = sdk.webhooks.generateTestHeader(payload, secret, 1_700_000_000);
    expect(sdk.webhooks.verifySignature(payload, header, secret, { now: 1_700_000_200 })).toBe(true);
    expect(sdk.webhooks.verifySignature(payload, header, secret, { now: 1_700_000_400 })).toBe(false);
  });

  it("accepts a Buffer body and array header", () => {
    const header = sdk.webhooks.generateTestHeader(payload, secret);
    expect(sdk.webhooks.verifySignature(Buffer.from(payload), [header], secret)).toBe(true);
  });
});
