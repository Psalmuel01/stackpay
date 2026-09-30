import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), supabaseRequest: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("../lib/server/supabase-admin", () => db);

import { evaluateAlerts, readiness, toPrometheus } from "../lib/server/operations";
import { GET as ready } from "../app/api/health/ready/route";
import { GET as metricsRoute } from "../app/api/internal/metrics/route";
import { GET as live } from "../app/api/health/route";
import { processorForDeployment, resetDeploymentCache, watchedContracts } from "../lib/server/deployments";

const ARCH = "ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch";
const PROC = "ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc";
const directory = [
  { id: "dep-old", architecture_contract_id: ARCH.replace(".arch", ".arch0"), processor_contract_id: PROC.replace(".proc", ".proc0"), active: false },
  { id: "dep-now", architecture_contract_id: ARCH, processor_contract_id: PROC, active: true },
];
/** Answers each RPC by name, like PostgREST would. */
const rpc = (metrics: unknown, deployments: unknown = directory) => async (fn: string) => (fn === "contract_deployment_directory" ? deployments : metrics);

const healthy = {
  chain_events: { pending: 0, dead: 0, oldest_pending_seconds: 0, processed_last_hour: 4 },
  webhooks: { pending: 0, oldest_pending_seconds: 0, succeeded_24h: 10, failed_24h: 0, dead_24h: 0, retries_24h: 1, disabled_endpoints: 0 },
  payments: { confirmed_24h: 3, median_recording_lag_seconds: 12 },
  invoices: { stale_pending: 0 },
  heartbeats: { jobs: { age_seconds: 30 }, chainhook: { age_seconds: 7200 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetDeploymentCache();
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID", ARCH);
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", PROC);
});

describe("alerts", () => {
  it("is quiet when idle: no Chainhook traffic alone is not an alert", () => {
    expect(evaluateAlerts(healthy)).toEqual([]);
  });

  it("flags stalled jobs, growing backlogs, and dead letters", () => {
    const ids = evaluateAlerts({
      ...healthy,
      chain_events: { pending: 5, dead: 2, oldest_pending_seconds: 3600 },
      webhooks: { ...healthy.webhooks, pending: 3, oldest_pending_seconds: 99999, dead_24h: 1 },
      invoices: { stale_pending: 4 },
      heartbeats: { jobs: { age_seconds: 3600 } },
    }).map((alert) => alert.id);
    expect(ids).toEqual(expect.arrayContaining(["jobs_not_running", "chain_backlog", "chain_dead_letters", "webhook_backlog", "webhook_dead_letters", "stale_pending_invoices"]));
  });

  it("treats a missing job heartbeat as critical and supports an explicit Chainhook expectation", () => {
    vi.stubEnv("STACKPAY_CHAINHOOK_STALE_MINUTES", "60");
    const alerts = evaluateAlerts({ ...healthy, heartbeats: {} });
    expect(alerts.find((a) => a.id === "jobs_not_running")?.severity).toBe("critical");
    expect(alerts.map((a) => a.id)).toContain("chainhook_silent");
  });
});

describe("probes", () => {
  it("liveness never touches dependencies", async () => {
    expect((await live()).status).toBe(200);
    expect(db.callRpc).not.toHaveBeenCalled();
  });

  it("is ready when the database and Stacks API respond", async () => {
    db.callRpc.mockImplementation(rpc(healthy));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ stacks_tip_height: 1234 })));
    const response = await ready();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", checks: { database: true, stacks_api: true, deployment: true } });
  });

  it("reports degraded (503) when the Stacks API is down, without leaking details publicly", async () => {
    db.callRpc.mockImplementation(rpc(healthy));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const response = await ready();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded", checks: { database: true, stacks_api: false, deployment: true } });
  });

  it("reports degraded when the database is unreachable", async () => {
    db.callRpc.mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    expect((await readiness()).checks.database.ok).toBe(false);
  });
});

describe("deployment identity", () => {
  it("is not ready until the configured contracts are the active registered deployment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ stacks_tip_height: 1 })));
    db.callRpc.mockImplementation(rpc(healthy, directory.map((row) => ({ ...row, active: false }))));
    expect((await readiness()).checks.deployment).toMatchObject({ ok: false, error: "DeploymentInactive" });
    resetDeploymentCache();
    db.callRpc.mockImplementation(rpc(healthy, []));
    const result = await readiness();
    expect(result.status).toBe("degraded");
    expect(result.checks.deployment).toMatchObject({ ok: false, error: "DeploymentUnregistered" });
  });

  it("routes an invoice to its own deployment's processor, falling back to configuration for legacy rows", async () => {
    db.callRpc.mockImplementation(rpc(healthy));
    expect(await processorForDeployment("dep-old")).toBe(PROC.replace(".proc", ".proc0"));
    expect(await processorForDeployment(null)).toBe(PROC);
    expect(await processorForDeployment("unknown")).toBe(PROC);
  });

  it("watches historical contracts too, and still works if the registry is unreachable", async () => {
    db.callRpc.mockImplementation(rpc(healthy));
    expect(await watchedContracts()).toEqual([ARCH, PROC, ARCH.replace(".arch", ".arch0"), PROC.replace(".proc", ".proc0")]);
    resetDeploymentCache();
    db.callRpc.mockRejectedValue(new Error("down"));
    expect(await watchedContracts()).toEqual([ARCH, PROC]);
  });
});

describe("metrics endpoint", () => {
  it("requires the job secret", async () => {
    vi.stubEnv("STACKPAY_JOB_SECRET", "s".repeat(32));
    expect((await metricsRoute(new Request("https://x/api/internal/metrics"))).status).toBe(401);
  });

  it("exports Prometheus gauges", async () => {
    vi.stubEnv("STACKPAY_JOB_SECRET", "s".repeat(32));
    db.callRpc.mockResolvedValue(healthy);
    const response = await metricsRoute(new Request("https://x/api/internal/metrics?format=prometheus", { headers: { authorization: `Bearer ${"s".repeat(32)}` } }));
    const text = await response.text();
    expect(text).toContain("stackpay_chain_events_pending 0");
    expect(text).toContain("stackpay_webhook_deliveries_succeeded_24h 10");
    expect(text).toContain('stackpay_heartbeat_age_seconds{source="jobs"} 30');
    expect(toPrometheus(healthy, [])).toContain("stackpay_alerts_active 0");
  });
});
