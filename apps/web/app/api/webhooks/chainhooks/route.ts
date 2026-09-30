import { timingSafeEqual } from "node:crypto";
import { apiFailure, jsonError, jsonOk } from "@/lib/server/http";
import { enqueueChainEvents, parseChainhookPayload, processChainEventInbox } from "@/lib/server/chain-events";
import { deliverDueWebhooks } from "@/lib/server/webhooks/service";
import { callRpc, isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { logEvent } from "@/lib/server/log";
import { watchedContracts } from "@/lib/server/deployments";

// Session-free and never cached: every delivery must reach the handler.
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expectedSecret = process.env.STACKPAY_CHAINHOOK_SECRET ?? "";
  if (!expectedSecret) {
    return false;
  }

  const headerSecret =
    request.headers.get("x-stackpay-chainhook-secret") ??
    request.headers.get("x-chainhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  const actual = Buffer.from(headerSecret);
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Chainhook delivery endpoint. Events are durably enqueued before the delivery is acknowledged,
 * then processed best-effort inline; anything not finished here is picked up by the job runner.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  if (!isAuthorized(request)) {
    return jsonError(401, "unauthorized", "Invalid Chainhook secret.");
  }

  try {
    const payload = await request.json();
    // Historical deployments stay watched so in-flight invoices on an old pair still project.
    const events = parseChainhookPayload(payload, await watchedContracts());
    const { enqueued, duplicates } = await enqueueChainEvents(events);
    await callRpc("record_heartbeat", { p_source: "chainhook", p_detail: { events: events.length, enqueued } }).catch(() => undefined);

    // Enqueueing succeeded, so the delivery is safe to acknowledge even if processing fails now.
    const processing = await processChainEventInbox({ limit: 25 }).catch((error) => {
      logEvent("chain_event.inline_processing_failed", { error: error instanceof Error ? error.name : "unknown" }, "warn");
      return null;
    });

    // Notify merchants promptly; anything not sent now is delivered by the job runner.
    if (processing?.processed) await deliverDueWebhooks({ limit: 10 }).catch(() => undefined);

    const summary = { received: true, events: events.length, enqueued, duplicates, processing };
    logEvent("chainhook.delivery", { events: events.length, enqueued, duplicates, processed: processing?.processed ?? null });
    return jsonOk(summary, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
