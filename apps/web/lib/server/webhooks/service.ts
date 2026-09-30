import { z } from "zod";
import { ApiError } from "../api-error";
import { callRpc, insertRow, patchRows, selectRows } from "../supabase-admin";
import { audit } from "../audit";
import { logEvent } from "../log";
import { decryptSecret, encryptSecret, generateSigningSecret, signPayload } from "./crypto";
import { EgressError, postJson, validateEndpointUrl } from "./egress";
import { deploymentEnvironment, type Page, listResponse, notFound, pageQuery } from "../api/v1";

/** Events StackPay emits today. Endpoints subscribe to "*" or a subset. */
export const WEBHOOK_EVENT_TYPES = [
  "invoice.created",
  "invoice.pending",
  "invoice.paid",
  "invoice.payment_reverted",
  "invoice.expired",
  "invoice.canceled",
  "settlement.confirmed",
] as const;

const MAX_ENDPOINTS = 16;
type Row = Record<string, any>;
type Actor = { type: "wallet" | "api_key"; id: string; requestId?: string };

export const createEndpointSchema = z
  .object({
    url: z.string().max(2048),
    description: z.string().max(200).default(""),
    enabled_events: z.array(z.enum(["*", ...WEBHOOK_EVENT_TYPES])).min(1).default(["*"]),
  })
  .strict();

export const updateEndpointSchema = z
  .object({
    description: z.string().max(200).optional(),
    enabled_events: z.array(z.enum(["*", ...WEBHOOK_EVENT_TYPES])).min(1).optional(),
    status: z.enum(["enabled", "disabled"]).optional(),
  })
  .strict();

function livemode() {
  return deploymentEnvironment() === "live";
}

export function serializeEndpoint(row: Row) {
  return {
    id: row.public_id,
    object: "webhook_endpoint",
    livemode: livemode(),
    url: row.url,
    description: row.description ?? "",
    enabled_events: row.enabled_events ?? ["*"],
    status: row.status,
    disabled_reason: row.disabled_reason ?? null,
    secret_prefix: row.secret_prefix ?? null,
    created_at: row.created_at,
  };
}

export function serializeDelivery(row: Row, endpoint?: Row | null, event?: Row | null) {
  return {
    id: row.public_id,
    object: "webhook_delivery",
    livemode: livemode(),
    status: row.status === "delivered" ? "succeeded" : row.status === "delivering" ? "pending" : row.status,
    endpoint: endpoint?.public_id ?? null,
    event: event?.public_id ?? null,
    event_type: row.event,
    attempts: row.attempts ?? 0,
    response_status: row.response_code ?? null,
    last_error: row.last_error ?? null,
    duration_ms: row.duration_ms ?? null,
    next_attempt_at: ["pending", "delivering"].includes(row.status) ? row.next_attempt_at : null,
    replay_of: row.replay_of ? true : false,
    created_at: row.created_at,
    completed_at: row.completed_at ?? null,
  };
}

async function endpointRow(merchantId: string, publicId: string) {
  const rows = (await selectRows("webhook_endpoints", { select: "*", public_id: `eq.${publicId}`, merchant_id: `eq.${merchantId}`, limit: 1 })) as Row[];
  if (!rows[0]) throw notFound("webhook endpoint", publicId);
  return rows[0];
}

export async function createEndpoint(merchantId: string, input: z.infer<typeof createEndpointSchema>, actor: Actor) {
  try {
    validateEndpointUrl(input.url);
  } catch (error) {
    throw new ApiError(400, "invalid_url", error instanceof Error ? error.message : "url is invalid.");
  }
  const existing = (await selectRows("webhook_endpoints", { select: "id", merchant_id: `eq.${merchantId}` })) as Row[];
  if (existing.length >= MAX_ENDPOINTS) throw new ApiError(409, "too_many_endpoints", `At most ${MAX_ENDPOINTS} webhook endpoints are allowed.`);
  const secret = generateSigningSecret();
  const row = await insertRow("webhook_endpoints", {
    merchant_id: merchantId,
    url: input.url,
    description: input.description,
    enabled_events: input.enabled_events,
    status: "enabled",
    secret_ciphertext: encryptSecret(secret),
    secret_prefix: secret.slice(0, 10),
    is_active: true,
  });
  await audit({ merchantId, actorType: actor.type, actorId: actor.id, action: "webhook_endpoint.created", targetType: "webhook_endpoint", targetId: row.public_id, requestId: actor.requestId, metadata: { url: input.url } });
  return { ...serializeEndpoint(row), secret };
}

export async function listEndpoints(merchantId: string, page: Page) {
  const rows = (await selectRows("webhook_endpoints", { select: "*", merchant_id: `eq.${merchantId}`, ...pageQuery(page) })) as Row[];
  return listResponse(rows, page, serializeEndpoint, "/api/v1/webhook-endpoints");
}

export async function retrieveEndpoint(merchantId: string, publicId: string) {
  return serializeEndpoint(await endpointRow(merchantId, publicId));
}

export async function updateEndpoint(merchantId: string, publicId: string, input: z.infer<typeof updateEndpointSchema>, actor: Actor) {
  const row = await endpointRow(merchantId, publicId);
  const patch: Row = {};
  if (input.description !== undefined) patch.description = input.description;
  if (input.enabled_events !== undefined) patch.enabled_events = input.enabled_events;
  if (input.status !== undefined) {
    if (input.status === "enabled" && !row.secret_ciphertext) throw new ApiError(409, "secret_required", "Rotate the signing secret before re-enabling this endpoint.");
    patch.status = input.status;
    patch.disabled_reason = input.status === "enabled" ? null : "disabled_by_merchant";
    if (input.status === "enabled") patch.consecutive_failures = 0;
  }
  if (Object.keys(patch).length) {
    await patchRows("webhook_endpoints", { id: String(row.id) }, patch);
    await audit({ merchantId, actorType: actor.type, actorId: actor.id, action: "webhook_endpoint.updated", targetType: "webhook_endpoint", targetId: publicId, requestId: actor.requestId, metadata: patch });
  }
  return retrieveEndpoint(merchantId, publicId);
}

export async function rotateEndpointSecret(merchantId: string, publicId: string, actor: Actor) {
  const row = await endpointRow(merchantId, publicId);
  const secret = generateSigningSecret();
  await patchRows("webhook_endpoints", { id: String(row.id) }, { secret_ciphertext: encryptSecret(secret), secret_prefix: secret.slice(0, 10) });
  await audit({ merchantId, actorType: actor.type, actorId: actor.id, action: "webhook_endpoint.secret_rotated", targetType: "webhook_endpoint", targetId: publicId, requestId: actor.requestId });
  return { ...(await retrieveEndpoint(merchantId, publicId)), secret };
}

/** Deleting keeps delivery history: the endpoint is disabled and detached rather than erased. */
export async function deleteEndpoint(merchantId: string, publicId: string, actor: Actor) {
  const row = await endpointRow(merchantId, publicId);
  await patchRows("webhook_endpoints", { id: String(row.id) }, { status: "disabled", disabled_reason: "deleted", secret_ciphertext: null, secret_prefix: null, is_active: false });
  await audit({ merchantId, actorType: actor.type, actorId: actor.id, action: "webhook_endpoint.deleted", targetType: "webhook_endpoint", targetId: publicId, requestId: actor.requestId });
  return { id: publicId, object: "webhook_endpoint", deleted: true };
}

export async function sendPing(merchantId: string, publicId: string) {
  const row = await endpointRow(merchantId, publicId);
  if (row.status !== "enabled") throw new ApiError(409, "endpoint_disabled", "Enable the endpoint before sending a test event.");
  const delivery = await callRpc<Row | null>("send_webhook_ping", { p_merchant_id: merchantId, p_endpoint_public_id: publicId });
  if (!delivery) throw notFound("webhook endpoint", publicId);
  return serializeDelivery(delivery, row, null);
}

async function withRelations(rows: Row[]) {
  const endpointIds = [...new Set(rows.map((row) => row.endpoint_id).filter(Boolean))];
  const eventIds = [...new Set(rows.map((row) => row.event_id).filter(Boolean))];
  const [endpoints, events] = await Promise.all([
    endpointIds.length ? (selectRows("webhook_endpoints", { select: "id,public_id", id: `in.(${endpointIds.join(",")})` }) as Promise<Row[]>) : Promise.resolve([]),
    eventIds.length ? (selectRows("merchant_events", { select: "id,public_id", id: `in.(${eventIds.join(",")})` }) as Promise<Row[]>) : Promise.resolve([]),
  ]);
  const endpointMap = new Map(endpoints.map((row) => [row.id, row]));
  const eventMap = new Map(events.map((row) => [row.id, row]));
  return (row: Row) => serializeDelivery(row, endpointMap.get(row.endpoint_id), eventMap.get(row.event_id));
}

export async function listDeliveries(merchantId: string, page: Page, filters: { endpoint?: string | null; status?: string | null }) {
  const query: Record<string, string | number> = { select: "*", merchant_id: `eq.${merchantId}`, event_id: "not.is.null", ...pageQuery(page) };
  if (filters.endpoint) query.endpoint_id = `eq.${(await endpointRow(merchantId, filters.endpoint)).id}`;
  if (filters.status) {
    const statuses: Record<string, string> = { pending: "in.(pending,delivering)", succeeded: "in.(succeeded,delivered)", failed: "eq.failed", dead: "eq.dead" };
    if (!statuses[filters.status]) throw new ApiError(400, "invalid_request", "status must be pending, succeeded, failed, or dead.");
    query.status = statuses[filters.status];
  }
  const rows = (await selectRows("webhook_deliveries", query)) as Row[];
  const serialize = await withRelations(rows.slice(0, page.limit));
  return listResponse(rows, page, serialize, "/api/v1/webhook-deliveries");
}

export async function retrieveDelivery(merchantId: string, publicId: string) {
  const rows = (await selectRows("webhook_deliveries", { select: "*", public_id: `eq.${publicId}`, merchant_id: `eq.${merchantId}`, limit: 1 })) as Row[];
  if (!rows[0]) throw notFound("webhook delivery", publicId);
  return (await withRelations(rows))(rows[0]);
}

export async function replayDelivery(merchantId: string, publicId: string, actor: Actor) {
  const replay = await callRpc<Row | null>("replay_webhook_delivery", { p_merchant_id: merchantId, p_public_id: publicId });
  if (!replay?.id) throw notFound("webhook delivery", publicId);
  await audit({ merchantId, actorType: actor.type, actorId: actor.id, action: "webhook_delivery.replayed", targetType: "webhook_delivery", targetId: publicId, requestId: actor.requestId });
  return retrieveDelivery(merchantId, replay.public_id);
}

// Delivery worker ---------------------------------------------------------------------------------

type ClaimedDelivery = {
  delivery_id: string;
  delivery_public_id: string;
  attempts: number;
  endpoint_public_id: string;
  url: string;
  secret_ciphertext: string | null;
  event_public_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  event_created_at: string;
};

/** Transient response codes worth retrying. Other 4xx responses are permanent for that delivery. */
function isRetryableStatus(status: number) {
  return status >= 500 || [408, 409, 425, 429].includes(status);
}

function retryAfterSeconds(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - Date.now()) / 1000)) : null;
}

export function eventPayload(delivery: Pick<ClaimedDelivery, "event_public_id" | "event_type" | "event_created_at" | "event_data">) {
  return JSON.stringify({
    id: delivery.event_public_id,
    object: "event",
    type: delivery.event_type,
    livemode: livemode(),
    created_at: delivery.event_created_at,
    data: { object: delivery.event_data },
  });
}

async function deliverOne(delivery: ClaimedDelivery) {
  const record = (fields: { success: boolean; status?: number | null; error?: string | null; durationMs?: number | null; retryable: boolean; retryAfter?: number | null; excerpt?: string | null }) =>
    callRpc<string>("record_webhook_attempt", {
      p_delivery_id: delivery.delivery_id,
      p_success: fields.success,
      p_response_status: fields.status ?? null,
      p_error: fields.error ?? null,
      p_duration_ms: fields.durationMs ?? null,
      p_retryable: fields.retryable,
      p_retry_after_seconds: fields.retryAfter ?? null,
      p_response_excerpt: fields.excerpt ?? null,
    });

  if (!delivery.secret_ciphertext) return record({ success: false, error: "endpoint has no signing secret", retryable: false });

  let secret: string;
  try {
    secret = decryptSecret(delivery.secret_ciphertext);
  } catch {
    return record({ success: false, error: "signing secret could not be decrypted", retryable: true });
  }

  const body = eventPayload(delivery);
  const { header } = signPayload(body, secret);
  try {
    const response = await postJson(delivery.url, body, {
      "Content-Type": "application/json",
      "User-Agent": "StackPay-Webhooks/1.0",
      "X-StackPay-Signature": header,
      "X-StackPay-Event-Id": delivery.event_public_id,
      "X-StackPay-Event-Type": delivery.event_type,
      "X-StackPay-Delivery-Id": delivery.delivery_public_id,
    });
    const success = response.status >= 200 && response.status < 300;
    return record({
      success,
      status: response.status,
      error: success ? null : `endpoint responded ${response.status}`,
      durationMs: response.durationMs,
      retryable: !success && isRetryableStatus(response.status),
      retryAfter: response.status === 429 || response.status === 503 ? retryAfterSeconds(response.headers["retry-after"]) : null,
      excerpt: response.excerpt,
    });
  } catch (error) {
    // Blocked destinations are a configuration problem, not a transient fault.
    const blocked = error instanceof EgressError && /public|https|credentials|port|fragment|hostname/.test(error.message);
    return record({ success: false, error: error instanceof Error ? error.message : "delivery failed", retryable: !blocked });
  }
}

/** Sends due deliveries. Safe to run concurrently and after crashes (leases). */
export async function deliverDueWebhooks(options: { limit?: number } = {}) {
  const claimed = await callRpc<ClaimedDelivery[]>("claim_webhook_deliveries", { p_limit: options.limit ?? 25, p_lease_seconds: 60 });
  const summary = { claimed: claimed.length, succeeded: 0, retried: 0, failed: 0 };
  // Bounded concurrency keeps one slow endpoint from stalling the batch.
  const queue = [...claimed];
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let delivery = queue.shift(); delivery; delivery = queue.shift()) {
      const outcome = await deliverOne(delivery).catch(() => "retry");
      if (outcome === "succeeded") summary.succeeded += 1;
      else if (outcome === "retry") summary.retried += 1;
      else summary.failed += 1;
      logEvent("webhook.delivery", { webhook_delivery_id: delivery.delivery_public_id, endpoint_id: delivery.endpoint_public_id, event_id: delivery.event_public_id, event_type: delivery.event_type, attempt: delivery.attempts, outcome }, outcome === "succeeded" ? "info" : "warn");
    }
  }));
  return summary;
}
