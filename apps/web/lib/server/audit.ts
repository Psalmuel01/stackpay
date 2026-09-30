import { insertRow } from "./supabase-admin";
import { logEvent } from "./log";

/** Append-only record of security-relevant actions (key lifecycle, webhook endpoint changes, …). */
export async function audit(entry: {
  merchantId: string | null;
  actorType: "wallet" | "api_key" | "system";
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  await insertRow("audit_log", {
    merchant_id: entry.merchantId,
    actor_type: entry.actorType,
    actor_id: entry.actorId,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    request_id: entry.requestId ?? null,
    metadata: entry.metadata ?? {},
  });
  logEvent("audit", { merchant_id: entry.merchantId, actor_type: entry.actorType, action: entry.action, target_id: entry.targetId });
}
