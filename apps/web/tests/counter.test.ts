import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), upsertRow: vi.fn(), isSupabaseConfigured: () => true }));
const auth = vi.hoisted(() => ({ requireMerchant: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
vi.mock("../lib/server/wallet-auth", () => auth);

import { POST as charge } from "../app/api/counter/charges/route";
import { ApiError } from "../lib/server/api-error";

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const ID = "inv_" + "d".repeat(24);
const post = (body: unknown) => charge(new Request("https://stackpay.test/api/counter/charges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({}) });
let universalLink: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  vi.stubEnv("STACKPAY_APP_ORIGIN", "https://stackpay.test");
  auth.requireMerchant.mockResolvedValue("ST1MERCHANT");
  universalLink = [{ id: "link", onchain_link_id: "LNK_1", draft_contract_call: { arguments: [{ value: "ST1RECIPIENT" }] } }];
  db.selectRows.mockImplementation(async (table: string) => {
    if (table === "merchant_profiles") return [{ id: MERCHANT, wallet_address: "ST1MERCHANT" }];
    if (table === "payment_links") return universalLink;
    if (table === "invoices") return [{ id: "row", public_id: ID, status: "draft", amount: 4.5, amount_text: "4.50000000", currency: "USDCx", metadata: { source: "counter" }, expires_at: "2026-10-02T06:15:00Z", created_at: "2026-10-02T06:00:00Z" }];
    return [];
  });
  db.callRpc.mockImplementation(async (fn: string) => (fn === "create_draft_invoice" ? { id: "row", public_id: ID } : null));
});

describe("Counter Mode charges", () => {
  it("creates a fixed-amount invoice for exactly the entered amount, payable for 15 minutes", async () => {
    const before = Date.now();
    const response = await post({ amount: "4.5", currency: "USDCx" });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({ id: ID, amount: "4.5", currency: "USDCx", checkout_url: `https://stackpay.test/pay/${ID}` });
    const args = db.callRpc.mock.calls.find(([fn]) => fn === "create_draft_invoice")![1];
    expect(args).toMatchObject({ p_merchant_id: MERCHANT, p_amount: "4.5", p_currency: "USDCx", p_metadata: { source: "counter" } });
    const ttl = (Date.parse(args.p_expires_at) - before) / 1000;
    expect(ttl).toBeGreaterThan(890);
    expect(ttl).toBeLessThan(910);
  });

  it.each([
    [{ amount: "0", currency: "USDCx" }],
    [{ amount: "1.0000001", currency: "USDCx" }],
    [{ amount: "5", currency: "DOGE" }],
    [{ amount: "5", currency: "STX", description: "override" }],
  ])("rejects invalid sales %#", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(db.callRpc).not.toHaveBeenCalledWith("create_draft_invoice", expect.anything());
  });

  it("explains a missing Universal QR instead of failing", async () => {
    universalLink = [];
    const response = await post({ amount: "1", currency: "STX" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("universal_link_required");
  });

  it("requires a signed-in merchant", async () => {
    auth.requireMerchant.mockRejectedValue(new ApiError(401, "authentication_required", "Sign in"));
    expect((await post({ amount: "1", currency: "STX" })).status).toBe(401);
  });
});
