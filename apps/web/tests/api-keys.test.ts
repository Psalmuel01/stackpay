import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), upsertRow: vi.fn(), isSupabaseConfigured: () => true }));
const auth = vi.hoisted(() => ({ requireMerchant: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
vi.mock("../lib/server/wallet-auth", () => auth);

import { POST as create, GET as list } from "../app/api/api-keys/route";
import { POST as rotate } from "../app/api/api-keys/[id]/rotate/route";
import { hashApiKey } from "../lib/server/api/v1";
import { ApiError } from "../lib/server/api-error";

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const req = (method: string, body?: unknown) => new Request("https://stackpay.test/api/api-keys", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  auth.requireMerchant.mockResolvedValue("ST1MERCHANT");
  db.selectRows.mockImplementation(async (table: string) => (table === "merchant_profiles" ? [{ id: MERCHANT, wallet_address: "ST1MERCHANT" }] : []));
  db.insertRow.mockImplementation(async (_table: string, row: Record<string, unknown>) => ({ id: "key_new", created_at: "2026-10-02T00:00:00Z", last_used_at: null, revoked_at: null, expires_at: null, ...row }));
});

describe("API key administration", () => {
  it("returns the secret once and stores only its hash", async () => {
    const response = await create(req("POST", { name: "Backend", scopes: ["invoices:read", "invoices:write"] }));
    const { data } = await response.json();
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.secret).toMatch(/^sk_test_[A-Za-z0-9_-]{43}$/);
    const stored = db.insertRow.mock.calls.find(([table]) => table === "api_keys")![1];
    expect(stored).toMatchObject({ merchant_id: MERCHANT, environment: "test", key_hash: hashApiKey(data.secret), key_prefix: data.secret.slice(0, 12), scopes: ["invoices:read", "invoices:write"] });
    expect(JSON.stringify(stored)).not.toContain(data.secret);
    expect(data.key).not.toHaveProperty("key_hash");
    expect(db.insertRow).toHaveBeenCalledWith("audit_log", expect.objectContaining({ action: "api_key.created", actor_type: "wallet" }));
  });

  it("rejects unknown scopes and empty scope lists", async () => {
    expect((await create(req("POST", { scopes: ["admin:all"] }))).status).toBe(400);
    expect((await create(req("POST", { scopes: [] }))).status).toBe(400);
  });

  it("caps the number of active keys", async () => {
    db.selectRows.mockImplementation(async (table: string) => (table === "merchant_profiles" ? [{ id: MERCHANT }] : Array.from({ length: 10 }, (_, i) => ({ id: `k${i}` }))));
    expect((await create(req("POST", { scopes: ["invoices:read"] }))).status).toBe(409);
  });

  it("requires a signed-in merchant", async () => {
    auth.requireMerchant.mockRejectedValue(new ApiError(401, "authentication_required", "Sign in"));
    expect((await list(req("GET"))).status).toBe(401);
    expect(db.insertRow).not.toHaveBeenCalled();
  });

  it("rotates with a 24 hour grace period for the old key", async () => {
    db.selectRows.mockImplementation(async (table: string) => table === "merchant_profiles" ? [{ id: MERCHANT }] : [{ id: "key_old", name: "Backend", scopes: ["invoices:read"], revoked_at: null, expires_at: null }]);
    const response = await rotate(new Request("https://stackpay.test/api/api-keys/key_old/rotate", { method: "POST" }), { params: Promise.resolve({ id: "key_old" }) });
    const { data } = await response.json();
    expect(data.secret).toMatch(/^sk_test_/);
    const [, filter, patch] = db.patchRows.mock.calls[0];
    expect(filter).toEqual({ id: "key_old" });
    const graceMs = Date.parse(patch.expires_at) - Date.now();
    expect(graceMs).toBeGreaterThan(23.9 * 3600_000);
    expect(graceMs).toBeLessThanOrEqual(24 * 3600_000);
  });
});
