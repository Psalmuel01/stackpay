import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  callRpc: vi.fn(),
  selectRows: vi.fn(),
  insertRow: vi.fn(),
  patchRows: vi.fn(),
  supabaseRequest: vi.fn(),
  upsertRow: vi.fn(),
  isSupabaseConfigured: () => true,
}));
vi.mock("../lib/server/supabase-admin", () => db);

import * as invoicesRoute from "../app/api/v1/invoices/route";
import * as invoiceRoute from "../app/api/v1/invoices/[id]/route";
import * as cancelRoute from "../app/api/v1/invoices/[id]/cancel/route";
import * as refundsRoute from "../app/api/v1/refunds/route";
import * as refundRoute from "../app/api/v1/refunds/[id]/route";

// Next.js 15 passes route params as a Promise; adapt the handlers for concise calls.
const noParams = { params: Promise.resolve({}) };
const withParams = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const createInvoice = (request: Request) => invoicesRoute.POST(request, noParams);
const listInvoices = (request: Request) => invoicesRoute.GET(request, noParams);
const getInvoice = (request: Request, context: { params: Record<string, string> }) => invoiceRoute.GET(request, withParams(context.params));
const cancelInvoice = (request: Request, context: { params: Record<string, string> }) => cancelRoute.POST(request, withParams(context.params));
import { hashApiKey } from "../lib/server/api/v1";

const KEY = "sk_test_" + "k".repeat(43);
const MERCHANT = "11111111-1111-1111-1111-111111111111";
const INVOICE_ID = "inv_" + "a".repeat(24);
const origin = "https://stackpay.test";

type Rpc = Record<string, unknown | ((args: any) => unknown)>;
let rpc: Rpc;

function key(scopes = ["invoices:read", "invoices:write"]) {
  return [{ key_id: "key_1", merchant_id: MERCHANT, environment: "test", scopes }];
}
function draftRow(overrides: Record<string, unknown> = {}) {
  return { id: "row-1", public_id: INVOICE_ID, status: "draft", amount: 25, amount_text: "25.00000000", currency: "USDCx", description: "Order 382", metadata: { orderId: "382" }, customer_name: "Ada", customer_email: "ada@example.com", recipient_address: "ST1RECIPIENT", onchain_invoice_id: null, tx_id: null, expires_at: "2026-10-03T00:00:00Z", paid_at: null, canceled_at: null, created_at: "2026-10-02T00:00:00.000000+00:00", ...overrides };
}
function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + path, {
    method,
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const valid = { amount: "25", currency: "USDCx", description: "Order 382", metadata: { orderId: "382" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  vi.stubEnv("STACKPAY_APP_ORIGIN", origin);
  rpc = {
    authenticate_api_key: key(),
    take_rate_limit: true,
    expire_due_invoices: 0,
    create_draft_invoice: draftRow(),
    begin_idempotent_request: { state: "new", id: 7 },
    complete_idempotent_request: null,
    release_idempotent_request: null,
  };
  db.callRpc.mockImplementation(async (fn: string, args: unknown) => {
    const value = rpc[fn];
    return typeof value === "function" ? (value as (a: unknown) => unknown)(args) : value;
  });
  db.selectRows.mockImplementation(async (table: string) => {
    if (table === "merchant_profiles") return [{ id: MERCHANT, wallet_address: "ST1MERCHANT" }];
    if (table === "payment_links") return [{ id: "link", onchain_link_id: "LNK_1", draft_contract_call: { arguments: [{ value: "ST1RECIPIENT" }] } }];
    if (table === "invoices") return [draftRow()];
    return [];
  });
});

describe("authentication and authorization", () => {
  it("requires a secret key and returns the error envelope with a request id", async () => {
    const response = await listInvoices(new Request(origin + "/api/v1/invoices"));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error).toMatchObject({ type: "authentication_error", code: "api_key_missing" });
    expect(body.error.request_id).toMatch(/^req_[0-9a-f]{24}$/);
    expect(response.headers.get("request-id")).toBe(body.error.request_id);
  });

  it("rejects a live key on the test deployment before any lookup", async () => {
    const response = await listInvoices(call("GET", "/api/v1/invoices", undefined, { authorization: `Bearer sk_live_${"k".repeat(43)}` }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("api_key_environment_mismatch");
    expect(db.callRpc).not.toHaveBeenCalled();
  });

  it("looks keys up by hash only and rejects unknown or revoked keys", async () => {
    rpc.authenticate_api_key = [];
    const response = await listInvoices(call("GET", "/api/v1/invoices"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("api_key_invalid");
    expect(db.callRpc).toHaveBeenCalledWith("authenticate_api_key", { p_key_hash: hashApiKey(KEY) });
    expect(JSON.stringify(db.callRpc.mock.calls)).not.toContain(KEY);
  });

  it("enforces scopes", async () => {
    rpc.authenticate_api_key = key(["invoices:read"]);
    const response = await createInvoice(call("POST", "/api/v1/invoices", valid));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatchObject({ type: "permission_error", code: "insufficient_scope" });
  });

  it("rate limits per key", async () => {
    rpc.take_rate_limit = false;
    const response = await listInvoices(call("GET", "/api/v1/invoices"));
    expect(response.status).toBe(429);
    expect(db.callRpc).toHaveBeenCalledWith("take_rate_limit", expect.objectContaining({ p_key: "api:key_1" }));
  });
});

describe("POST /api/v1/invoices", () => {
  it("creates a draft for the key's merchant and returns exact amounts and a checkout URL", async () => {
    const response = await createInvoice(call("POST", "/api/v1/invoices", { ...valid, merchant_id: undefined }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ id: INVOICE_ID, object: "invoice", status: "draft", amount: "25", amount_units: "25000000", currency: "USDCx", livemode: false, metadata: { orderId: "382" }, checkout_url: `${origin}/pay/${INVOICE_ID}`, payment: null });
    expect(db.callRpc).toHaveBeenCalledWith("create_draft_invoice", expect.objectContaining({ p_merchant_id: MERCHANT, p_amount: "25", p_currency: "USDCx", p_recipient: "ST1RECIPIENT" }));
    expect(JSON.stringify(body)).not.toContain("row-1");
  });

  it.each([
    [{ ...valid, currency: "DOGE" }, "currency"],
    [{ ...valid, amount: "0.0000001" }, "amount"],
    [{ ...valid, amount: "-5" }, "amount"],
    [{ ...valid, metadata: { nested: { a: 1 } } }, "metadata.nested"],
    [{ ...valid, metadata: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, "v"])) }, "metadata"],
    [{ ...valid, expires_in: 10 }, "expires_in"],
    [{ ...valid, customer: { email: "not-an-email" } }, "customer.email"],
    [{ ...valid, success_url: "http://shop.example/thanks" }, "success_url"],
    [{ ...valid, success_url: "javascript:alert(1)" }, "success_url"],
    [{ ...valid, success_url: "https://user:pw@shop.example/" }, "success_url"],
  ])("rejects invalid input %#", async (body, param) => {
    const response = await createInvoice(call("POST", "/api/v1/invoices", body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ type: "invalid_request_error", param });
    expect(db.callRpc).not.toHaveBeenCalledWith("create_draft_invoice", expect.anything());
  });

  it("normalizes and stores an https success_url", async () => {
    rpc.create_draft_invoice = draftRow({ success_url: "https://shop.example/?order=382" });
    db.selectRows.mockImplementation(async (table: string) => {
      if (table === "merchant_profiles") return [{ id: MERCHANT, wallet_address: "ST1MERCHANT" }];
      if (table === "payment_links") return [{ id: "link", onchain_link_id: "LNK_1", draft_contract_call: { arguments: [{ value: "ST1RECIPIENT" }] } }];
      if (table === "invoices") return [draftRow({ success_url: "https://shop.example/?order=382" })];
      return [];
    });
    const response = await createInvoice(call("POST", "/api/v1/invoices", { ...valid, success_url: "https://shop.example?order=382" }));
    expect(response.status).toBe(201);
    expect(db.callRpc).toHaveBeenCalledWith("create_draft_invoice", expect.objectContaining({ p_success_url: "https://shop.example/?order=382" }));
    expect((await response.json()).success_url).toBe("https://shop.example/?order=382");
  });

  it("rejects unknown fields, including an attempt to choose the merchant", async () => {
    const response = await createInvoice(call("POST", "/api/v1/invoices", { ...valid, merchant_id: "other" }));
    expect(response.status).toBe(400);
  });

  it("requires a live Universal link", async () => {
    db.selectRows.mockImplementation(async (table: string) => (table === "merchant_profiles" ? [{ id: MERCHANT }] : []));
    const response = await createInvoice(call("POST", "/api/v1/invoices", valid));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("universal_link_required");
  });
});

describe("idempotency", () => {
  it("stores the response of a first request", async () => {
    const response = await createInvoice(call("POST", "/api/v1/invoices", valid, { "idempotency-key": "order-382" }));
    expect(response.status).toBe(201);
    expect(db.callRpc).toHaveBeenCalledWith("begin_idempotent_request", expect.objectContaining({ p_merchant_id: MERCHANT, p_environment: "test", p_key: "order-382", p_route: "POST /api/v1/invoices" }));
    expect(db.callRpc).toHaveBeenCalledWith("complete_idempotent_request", expect.objectContaining({ p_id: 7, p_status: 201, p_body: expect.objectContaining({ id: INVOICE_ID }) }));
  });

  it("replays the original response for an exact retry without creating anything", async () => {
    rpc.begin_idempotent_request = { state: "replay", status: 201, body: { id: INVOICE_ID, object: "invoice" } };
    const response = await createInvoice(call("POST", "/api/v1/invoices", valid, { "idempotency-key": "order-382" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("idempotent-replayed")).toBe("true");
    expect(await response.json()).toEqual({ id: INVOICE_ID, object: "invoice" });
    expect(db.callRpc).not.toHaveBeenCalledWith("create_draft_invoice", expect.anything());
  });

  it("hashes the canonical body so key order does not matter", async () => {
    await createInvoice(call("POST", "/api/v1/invoices", { currency: "USDCx", amount: "25" }, { "idempotency-key": "a" }));
    await createInvoice(call("POST", "/api/v1/invoices", { amount: "25", currency: "USDCx" }, { "idempotency-key": "a" }));
    const hashes = db.callRpc.mock.calls.filter(([fn]) => fn === "begin_idempotent_request").map(([, args]) => (args as any).p_request_hash);
    expect(hashes[0]).toBe(hashes[1]);
  });

  it("rejects a key reused with a different body", async () => {
    rpc.begin_idempotent_request = { state: "mismatch" };
    const response = await createInvoice(call("POST", "/api/v1/invoices", valid, { "idempotency-key": "order-382" }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.type).toBe("idempotency_error");
  });

  it("reports a concurrent request with the same key", async () => {
    rpc.begin_idempotent_request = { state: "in_progress" };
    expect((await createInvoice(call("POST", "/api/v1/invoices", valid, { "idempotency-key": "k" }))).status).toBe(409);
  });

  it("releases the key after a transient failure so the retry can succeed", async () => {
    rpc.create_draft_invoice = () => { throw new Error("database timeout"); };
    const response = await createInvoice(call("POST", "/api/v1/invoices", valid, { "idempotency-key": "k" }));
    expect(response.status).toBe(500);
    expect(db.callRpc).toHaveBeenCalledWith("release_idempotent_request", { p_id: 7 });
    expect(db.callRpc).not.toHaveBeenCalledWith("complete_idempotent_request", expect.anything());
  });

  it("stores deterministic client errors so a retry sees the same answer", async () => {
    rpc.cancel_draft_invoice = { outcome: "not_found" };
    await cancelInvoice(call("POST", `/api/v1/invoices/${INVOICE_ID}/cancel`, undefined, { "idempotency-key": "k" }), { params: { id: INVOICE_ID } });
    expect(db.callRpc).toHaveBeenCalledWith("complete_idempotent_request", expect.objectContaining({ p_status: 404 }));
  });

  it("does not pin state-dependent conflicts to the key", async () => {
    db.selectRows.mockImplementation(async (table: string) => (table === "merchant_profiles" ? [{ id: MERCHANT }] : []));
    await createInvoice(call("POST", "/api/v1/invoices", valid, { "idempotency-key": "k" }));
    expect(db.callRpc).toHaveBeenCalledWith("release_idempotent_request", { p_id: 7 });
  });
});

describe("refunds", () => {
  const REFUND = "rfd_" + "c".repeat(24);
  const refundRow = { id: "r1", public_id: REFUND, invoice_id: "row-1", amount: 4, amount_text: "4.00000000", currency: "USDCx", recipient: "ST1PAYER", reason: "Damaged", tx_id: "0xabc", block_height: 812, created_at: "2026-10-05T00:00:00.000000+00:00" };

  it("requires the refunds:read scope", async () => {
    const response = await refundsRoute.GET(call("GET", "/api/v1/refunds"), noParams);
    expect(response.status).toBe(403);
  });

  it("lists and retrieves the key's merchant's verified refunds with exact amounts", async () => {
    rpc.authenticate_api_key = key(["refunds:read"]);
    db.selectRows.mockImplementation(async (table: string) => (table === "refunds" ? [refundRow] : table === "invoices" ? [draftRow({ status: "paid", onchain_invoice_id: "INV_1" })] : []));
    const list = await (await refundsRoute.GET(call("GET", "/api/v1/refunds"), noParams)).json();
    expect(list.data[0]).toMatchObject({ id: REFUND, object: "refund", invoice: INVOICE_ID, amount: "4", amount_units: "4000000", recipient: "ST1PAYER", tx_id: "0xabc", metadata: { orderId: "382" } });
    const one = await refundRoute.GET(call("GET", `/api/v1/refunds/${REFUND}`), withParams({ id: REFUND }));
    expect(one.status).toBe(200);
    expect(db.selectRows).toHaveBeenCalledWith("refunds", expect.objectContaining({ public_id: `eq.${REFUND}`, merchant_id: `eq.${MERCHANT}` }));
  });
});

describe("reads", () => {
  it("scopes retrieval to the key's merchant", async () => {
    await getInvoice(call("GET", `/api/v1/invoices/${INVOICE_ID}`), { params: { id: INVOICE_ID } });
    expect(db.selectRows).toHaveBeenCalledWith("invoices", expect.objectContaining({ public_id: `eq.${INVOICE_ID}`, merchant_id: `eq.${MERCHANT}` }));
  });

  it("returns 404 for another merchant's invoice or a malformed id", async () => {
    db.selectRows.mockResolvedValue([]);
    expect((await getInvoice(call("GET", `/api/v1/invoices/${INVOICE_ID}`), { params: { id: INVOICE_ID } })).status).toBe(404);
    expect((await getInvoice(call("GET", "/api/v1/invoices/x"), { params: { id: "x" } })).status).toBe(404);
  });

  it("paginates with an opaque cursor", async () => {
    const rows = [draftRow({ id: "r3", created_at: "2026-10-03T00:00:00+00:00" }), draftRow({ id: "r2", created_at: "2026-10-02T00:00:00+00:00" }), draftRow({ id: "r1", created_at: "2026-10-01T00:00:00+00:00" })];
    db.selectRows.mockImplementation(async (table: string) => (table === "invoices" ? rows : []));
    const first = await (await listInvoices(call("GET", "/api/v1/invoices?limit=2"))).json();
    expect(first).toMatchObject({ object: "list", has_more: true });
    expect(first.data).toHaveLength(2);
    await listInvoices(call("GET", `/api/v1/invoices?limit=2&starting_after=${first.next_cursor}`));
    expect(db.selectRows).toHaveBeenCalledWith("invoices", expect.objectContaining({ limit: 3, or: "(created_at.lt.2026-10-02T00:00:00+00:00,and(created_at.eq.2026-10-02T00:00:00+00:00,id.lt.r2))" }));
  });

  it.each(["limit=0", "limit=101", "limit=abc", "starting_after=garbage", "status=unknown"])("rejects %s", async (query) => {
    expect((await listInvoices(call("GET", `/api/v1/invoices?${query}`))).status).toBe(400);
  });
});

describe("cancel", () => {
  it("refuses to cancel an invoice that exists on-chain", async () => {
    rpc.cancel_draft_invoice = { outcome: "not_cancelable", status: "pending" };
    const response = await cancelInvoice(call("POST", `/api/v1/invoices/${INVOICE_ID}/cancel`), { params: { id: INVOICE_ID } });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("invoice_not_cancelable");
  });
});
