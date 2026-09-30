import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), upsertRow: vi.fn(), isSupabaseConfigured: () => true }));
vi.mock("../lib/server/supabase-admin", () => db);

import { StackPay, AuthenticationError, InvalidRequestError } from "../../../packages/sdk/src/index";
import * as invoicesRoute from "../app/api/v1/invoices/route";
import * as invoiceRoute from "../app/api/v1/invoices/[id]/route";
import * as cancelRoute from "../app/api/v1/invoices/[id]/cancel/route";

/** Routes SDK requests straight into the Next.js route handlers (no network). */
const routes: Array<[RegExp, Record<string, (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>>]> = [
  [/^\/api\/v1\/invoices$/, invoicesRoute as never],
  [/^\/api\/v1\/invoices\/(?<id>[^/]+)$/, invoiceRoute as never],
  [/^\/api\/v1\/invoices\/(?<id>[^/]+)\/cancel$/, cancelRoute as never],
];
const handlerFetch: typeof fetch = async (input, init) => {
  const request = new Request(input as string, init);
  const { pathname } = new URL(request.url);
  for (const [pattern, handlers] of routes) {
    const match = pattern.exec(pathname);
    if (match && handlers[request.method]) return handlers[request.method](request, { params: { ...(match.groups ?? {}) } });
  }
  return new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "not_found" } }), { status: 404 });
};

const KEY = "sk_test_" + "i".repeat(43);
const MERCHANT = "22222222-2222-2222-2222-222222222222";
const store = new Map<string, Record<string, unknown>>();
const idempotency = new Map<string, { state: string; status?: number; body?: unknown; hash: string }>();

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  idempotency.clear();
  vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  vi.stubEnv("STACKPAY_APP_ORIGIN", "https://pay.example.com");
  let sequence = 0;
  db.callRpc.mockImplementation(async (fn: string, args: Record<string, any>) => {
    switch (fn) {
      case "authenticate_api_key": return [{ key_id: "key_int", merchant_id: MERCHANT, environment: "test", scopes: ["invoices:read", "invoices:write"] }];
      case "take_rate_limit": return true;
      case "expire_due_invoices": return 0;
      case "create_draft_invoice": {
        sequence += 1;
        const row = { id: `row-${sequence}`, public_id: `inv_${String(sequence).padStart(24, "0")}`, merchant_id: MERCHANT, status: "draft", amount: Number(args.p_amount), amount_text: args.p_amount, currency: args.p_currency, description: args.p_description, metadata: args.p_metadata, customer_name: args.p_customer_name, customer_email: args.p_customer_email, recipient_address: args.p_recipient, expires_at: args.p_expires_at, created_at: `2026-10-0${sequence}T00:00:00+00:00` };
        store.set(row.id, row);
        return row;
      }
      case "cancel_draft_invoice": {
        const row = [...store.values()].find((r) => r.public_id === args.p_public_id);
        if (!row) return { outcome: "not_found" };
        row.status = "canceled";
        return { outcome: "canceled" };
      }
      case "begin_idempotent_request": {
        const existing = idempotency.get(args.p_key);
        if (!existing) { idempotency.set(args.p_key, { state: "in_progress", hash: args.p_request_hash }); return { state: "new", id: args.p_key }; }
        if (existing.hash !== args.p_request_hash) return { state: "mismatch" };
        return existing.state === "completed" ? { state: "replay", status: existing.status, body: existing.body } : { state: "in_progress" };
      }
      case "complete_idempotent_request": { const entry = idempotency.get(args.p_id)!; Object.assign(entry, { state: "completed", status: args.p_status, body: args.p_body }); return null; }
      case "release_idempotent_request": idempotency.delete(args.p_id); return null;
      default: return null;
    }
  });
  db.selectRows.mockImplementation(async (table: string, query: Record<string, string>) => {
    if (table === "merchant_profiles") return [{ id: MERCHANT, wallet_address: "ST1MERCHANT" }];
    if (table === "payment_links") return [{ id: "link", onchain_link_id: "LNK_1", draft_contract_call: { arguments: [{ value: "ST1RECIPIENT" }] } }];
    if (table === "receipts") return [];
    if (table === "invoices") {
      let rows = [...store.values()].filter((row) => row.merchant_id === MERCHANT);
      if (query.public_id) rows = rows.filter((row) => `eq.${row.public_id}` === query.public_id);
      if (query.id) rows = rows.filter((row) => `eq.${row.id}` === query.id);
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      if (query.or) { const cutoff = /created_at\.lt\.([^,]+),/.exec(query.or)![1]; rows = rows.filter((row) => String(row.created_at) < cutoff); }
      return rows.slice(0, Number(query.limit ?? rows.length));
    }
    return [];
  });
});

const stackpay = () => new StackPay({ secretKey: KEY, baseUrl: "https://pay.example.com", fetch: handlerFetch, maxNetworkRetries: 0 });

describe("SDK against the real /api/v1 handlers", () => {
  it("creates, retrieves, lists, and cancels invoices", async () => {
    const sdk = stackpay();
    const created = await sdk.invoices.create({ amount: "25", currency: "USDCx", description: "Order 382", metadata: { orderId: "382" } });
    expect(created).toMatchObject({ object: "invoice", status: "draft", amount: "25", amount_units: "25000000", checkout_url: `https://pay.example.com/pay/${created.id}` });

    expect((await sdk.invoices.retrieve(created.id)).metadata).toEqual({ orderId: "382" });

    await sdk.invoices.create({ amount: "1", currency: "STX" });
    await sdk.invoices.create({ amount: "2", currency: "STX" });
    const seen: string[] = [];
    for await (const invoice of sdk.invoices.listAll({ limit: 2 })) seen.push(invoice.id);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);

    expect((await sdk.invoices.cancel(created.id)).status).toBe("canceled");
  });

  it("replays a retried create instead of duplicating it", async () => {
    const sdk = stackpay();
    const first = await sdk.invoices.create({ amount: "5", currency: "STX" }, { idempotencyKey: "order-500" });
    const retry = await sdk.invoices.create({ amount: "5", currency: "STX" }, { idempotencyKey: "order-500" });
    expect(retry.id).toBe(first.id);
    expect(store.size).toBe(1);
  });

  it("surfaces typed errors with the request id", async () => {
    const error = await stackpay().invoices.create({ amount: "0.0000001", currency: "STX" }).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidRequestError);
    expect(error.param).toBe("amount");
    expect(error.requestId).toMatch(/^req_/);

    db.callRpc.mockImplementationOnce(async () => []);
    await expect(stackpay().invoices.list()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
