import { stacksNetworks } from "@stackpay/config";
import { callRpc, isSupabaseConfigured } from "./supabase-admin";

/**
 * Operational health. Liveness is cheap; readiness probes dependencies; metrics and alerts come
 * from one database snapshot. Thresholds are deliberately conservative defaults and can be tuned
 * with environment variables.
 */

type Metrics = Record<string, any>;
export type Alert = { id: string; severity: "warning" | "critical"; message: string };

const minutes = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export async function getMetrics(): Promise<Metrics> {
  return callRpc<Metrics>("operational_metrics");
}

/** Alerts distinguish idle (no traffic) from broken (backlog growing, jobs not running, DLQ). */
export function evaluateAlerts(metrics: Metrics): Alert[] {
  const alerts: Alert[] = [];
  const chain = metrics.chain_events ?? {};
  const hooks = metrics.webhooks ?? {};
  const heartbeats = metrics.heartbeats ?? {};
  const jobsAge = heartbeats.jobs?.age_seconds ?? null;

  if (jobsAge === null || jobsAge > minutes("STACKPAY_JOBS_STALE_MINUTES", 10) * 60) {
    alerts.push({ id: "jobs_not_running", severity: "critical", message: "The background job runner has not run recently; retries and webhook deliveries are stalled." });
  }
  if (chain.pending > 0 && chain.oldest_pending_seconds > minutes("STACKPAY_CHAIN_BACKLOG_MINUTES", 15) * 60) {
    alerts.push({ id: "chain_backlog", severity: "critical", message: `${chain.pending} chain events have been waiting more than ${minutes("STACKPAY_CHAIN_BACKLOG_MINUTES", 15)} minutes (chain or database may be unavailable).` });
  }
  if (chain.dead > 0) {
    alerts.push({ id: "chain_dead_letters", severity: "warning", message: `${chain.dead} chain events are dead-lettered and need review.` });
  }
  if (hooks.pending > 0 && hooks.oldest_pending_seconds > minutes("STACKPAY_WEBHOOK_BACKLOG_MINUTES", 180) * 60) {
    alerts.push({ id: "webhook_backlog", severity: "warning", message: `${hooks.pending} webhook deliveries are older than ${minutes("STACKPAY_WEBHOOK_BACKLOG_MINUTES", 180)} minutes.` });
  }
  if (hooks.dead_24h > 0) {
    alerts.push({ id: "webhook_dead_letters", severity: "warning", message: `${hooks.dead_24h} webhook deliveries exhausted their retries in the last 24 hours.` });
  }
  if ((metrics.invoices?.stale_pending ?? 0) > 0) {
    alerts.push({ id: "stale_pending_invoices", severity: "warning", message: `${metrics.invoices.stale_pending} invoices are past expiry but still pending (expiry job not running?).` });
  }
  const chainhookAge = heartbeats.chainhook?.age_seconds ?? null;
  const staleAfter = minutes("STACKPAY_CHAINHOOK_STALE_MINUTES", 0);
  // Chainhook only calls when matching events occur, so silence is normal unless an expectation is configured.
  if (staleAfter > 0 && (chainhookAge === null || chainhookAge > staleAfter * 60)) {
    alerts.push({ id: "chainhook_silent", severity: "warning", message: `No Chainhook delivery for over ${staleAfter} minutes.` });
  }
  return alerts;
}

async function probe<T>(fn: () => Promise<T>) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { ok: true as const, latency_ms: Date.now() - started, detail };
  } catch (error) {
    return { ok: false as const, latency_ms: Date.now() - started, error: error instanceof Error ? error.name : "error" };
  }
}

export async function readiness() {
  const network = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";
  const apiUrl = process.env.STACKPAY_STACKS_API_URL ?? stacksNetworks[network]?.apiUrl ?? stacksNetworks.testnet.apiUrl;
  const [database, chain] = await Promise.all([
    probe(async () => {
      if (!isSupabaseConfigured()) throw new Error("NotConfigured");
      return getMetrics();
    }),
    probe(async () => {
      const response = await fetch(`${apiUrl}/v2/info`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`HTTP${response.status}`);
      const info = await response.json();
      return { stacks_tip_height: info.stacks_tip_height ?? null };
    }),
  ]);
  const metrics = database.ok ? (database.detail as Metrics) : null;
  return {
    status: database.ok && chain.ok ? "ready" : "degraded",
    checks: {
      database: { ok: database.ok, latency_ms: database.latency_ms, ...(database.ok ? {} : { error: database.error }) },
      stacks_api: { ok: chain.ok, latency_ms: chain.latency_ms, ...(chain.ok ? { tip_height: (chain.detail as { stacks_tip_height: number | null }).stacks_tip_height } : { error: chain.error }) },
      chainhook: { last_delivery_at: metrics?.heartbeats?.chainhook?.last_seen_at ?? null, pending_events: metrics?.chain_events?.pending ?? null, dead_events: metrics?.chain_events?.dead ?? null },
      jobs: { last_run_at: metrics?.heartbeats?.jobs?.last_seen_at ?? null },
    },
    alerts: metrics ? evaluateAlerts(metrics) : [],
  };
}

/** Prometheus text exposition of the numeric metrics. */
export function toPrometheus(metrics: Metrics, alerts: Alert[]) {
  const lines: string[] = [];
  const gauge = (name: string, value: unknown, help: string) => {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return;
    lines.push(`# HELP stackpay_${name} ${help}`, `# TYPE stackpay_${name} gauge`, `stackpay_${name} ${number}`);
  };
  const c = metrics.chain_events ?? {};
  const w = metrics.webhooks ?? {};
  const p = metrics.payments ?? {};
  gauge("chain_events_pending", c.pending, "Chain events awaiting projection.");
  gauge("chain_events_dead", c.dead, "Dead-lettered chain events.");
  gauge("chain_events_oldest_pending_seconds", c.oldest_pending_seconds, "Age of the oldest pending chain event.");
  gauge("chain_events_processed_last_hour", c.processed_last_hour, "Chain events processed in the last hour.");
  gauge("webhook_deliveries_pending", w.pending, "Webhook deliveries awaiting an attempt.");
  gauge("webhook_deliveries_succeeded_24h", w.succeeded_24h, "Successful webhook deliveries in 24h.");
  gauge("webhook_deliveries_failed_24h", w.failed_24h, "Permanently failed webhook deliveries in 24h.");
  gauge("webhook_deliveries_dead_24h", w.dead_24h, "Webhook deliveries that exhausted retries in 24h.");
  gauge("webhook_retries_24h", w.retries_24h, "Webhook retry attempts in 24h.");
  gauge("webhook_endpoints_disabled", w.disabled_endpoints, "Endpoints disabled after failures.");
  gauge("payments_confirmed_24h", p.confirmed_24h, "Payments confirmed in 24h.");
  gauge("payment_recording_lag_seconds_median", p.median_recording_lag_seconds, "Median seconds from chain confirmation to recording.");
  gauge("invoices_stale_pending", metrics.invoices?.stale_pending, "Pending invoices past expiry.");
  for (const [source, beat] of Object.entries((metrics.heartbeats ?? {}) as Record<string, { age_seconds: number }>)) {
    lines.push(`stackpay_heartbeat_age_seconds{source="${source.replace(/[^a-z_]/g, "")}"} ${beat.age_seconds}`);
  }
  lines.push(`stackpay_alerts_active ${alerts.length}`);
  return `${lines.join("\n")}\n`;
}
