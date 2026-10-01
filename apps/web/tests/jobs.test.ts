import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), supabaseRequest: vi.fn(), isSupabaseConfigured: () => true }));
const chain = vi.hoisted(() => ({ processChainEventInbox: vi.fn() }));
const hooks = vi.hoisted(() => ({ deliverDueWebhooks: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
vi.mock("../lib/server/chain-events", () => chain);
vi.mock("../lib/server/webhooks/service", () => hooks);

import { GET, POST } from "../app/api/internal/jobs/route";

const SECRET = "j".repeat(64);
const call = (handler: typeof GET, token?: string) =>
  handler(new Request("https://pay.example/api/internal/jobs", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STACKPAY_JOB_SECRET", SECRET);
  db.callRpc.mockResolvedValue(0);
  chain.processChainEventInbox.mockResolvedValue({ processed: 0 });
  hooks.deliverDueWebhooks.mockResolvedValue({ delivered: 0 });
});

describe("job runner", () => {
  it("requires the job secret", async () => {
    expect((await call(POST)).status).toBe(401);
    expect((await call(POST, "wrong")).status).toBe(401);
    expect(chain.processChainEventInbox).not.toHaveBeenCalled();
  });

  it("accepts CRON_SECRET for schedulers that send it, over GET or POST", async () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(64));
    expect((await call(GET, "c".repeat(64))).status).toBe(200);
  });

  it("retries chain events, delivers webhooks, expires unread invoices, purges, and records a heartbeat", async () => {
    const response = await call(POST, SECRET);
    expect(response.status).toBe(200);
    expect(chain.processChainEventInbox).toHaveBeenCalled();
    expect(hooks.deliverDueWebhooks).toHaveBeenCalled();
    const rpcs = db.callRpc.mock.calls.map(([fn]) => fn);
    expect(rpcs).toEqual(expect.arrayContaining(["expire_due_invoices", "purge_expired_auth_rows", "purge_expired_idempotency_keys", "record_heartbeat"]));
    expect(db.callRpc).toHaveBeenCalledWith("expire_due_invoices", { p_merchant_id: null, p_onchain_invoice_id: null });
  });

  it("keeps going when one step fails", async () => {
    hooks.deliverDueWebhooks.mockRejectedValue(new Error("boom"));
    const { data } = await (await call(POST, SECRET)).json();
    expect(data.webhooks).toEqual({ error: "boom" });
    expect(db.callRpc).toHaveBeenCalledWith("record_heartbeat", expect.anything());
  });
});
