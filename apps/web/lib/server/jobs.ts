import { timingSafeEqual } from "node:crypto";
import { processChainEventInbox } from "./chain-events";
import { logEvent } from "./log";
import { callRpc } from "./supabase-admin";

/**
 * Background work runner. Invoked by a scheduler (for example Vercel Cron, which sends
 * `Authorization: Bearer $CRON_SECRET`) or any trusted caller holding STACKPAY_JOB_SECRET.
 * Every job is idempotent and lease-based, so overlapping runs are safe.
 */
export function isJobRequestAuthorized(request: Request) {
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!presented) return false;
  return [process.env.STACKPAY_JOB_SECRET, process.env.CRON_SECRET].some((secret) => {
    if (!secret) return false;
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export type JobRunSummary = Record<string, unknown>;

export async function runJobs(): Promise<JobRunSummary> {
  const startedAt = Date.now();
  const summary: JobRunSummary = {};
  summary.chainEvents = await processChainEventInbox({ limit: 50 }).catch((error) => ({ error: error instanceof Error ? error.message : "failed" }));
  summary.retention = await callRpc("purge_expired_auth_rows").catch(() => ({ error: "failed" }));
  summary.durationMs = Date.now() - startedAt;
  logEvent("jobs.run", { duration_ms: summary.durationMs as number });
  return summary;
}
