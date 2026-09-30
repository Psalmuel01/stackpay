import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from "zod";
import { ApiError } from "../api-error";
import { callRpc, isSupabaseConfigured } from "../supabase-admin";
import { logEvent } from "../log";

/**
 * Framework for the public, versioned API (/api/v1).
 *
 * Every response carries a request id. Errors use one envelope:
 *   { "error": { "type", "code", "message", "param"?, "request_id" } }
 * Authentication is a secret API key (Authorization: Bearer sk_test_… / sk_live_…) that is bound
 * to this deployment's environment and carries scopes. Write endpoints honour Idempotency-Key.
 */

export const API_SCOPES = [
  "invoices:read",
  "invoices:write",
  "payment_links:read",
  "payment_links:write",
  "receipts:read",
  "settlements:read",
  "events:read",
  "webhooks:read",
  "webhooks:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export type ApiEnvironment = "test" | "live";

export type ApiErrorType = "invalid_request_error" | "authentication_error" | "permission_error" | "idempotency_error" | "rate_limit_error" | "api_error";

export class V1Error extends Error {
  constructor(
    public status: number,
    public type: ApiErrorType,
    public code: string,
    message: string,
    public param?: string
  ) {
    super(message);
  }
}

export type ApiContext = {
  requestId: string;
  merchantId: string;
  keyId: string;
  environment: ApiEnvironment;
  scopes: ApiScope[];
  origin: string;
};

/** Environment of this deployment: mainnet is live, everything else is test. */
export function deploymentEnvironment(): ApiEnvironment {
  return process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "live" : "test";
}

export function newRequestId() {
  return `req_${randomBytes(12).toString("hex")}`;
}

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

/** Generates a key. The secret is shown once; only its hash is stored. */
export function generateApiKey(environment: ApiEnvironment) {
  const secret = `sk_${environment}_${randomBytes(32).toString("base64url")}`;
  return { secret, prefix: secret.slice(0, 12), hash: hashApiKey(secret) };
}

function publicOrigin(request: Request) {
  const configured = process.env.STACKPAY_APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL;
  try {
    return new URL(configured || request.url).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

export function v1Json(body: unknown, requestId: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { "Request-Id": requestId, "Cache-Control": "no-store", ...init.headers },
  });
}

function errorBody(error: V1Error, requestId: string) {
  return { error: { type: error.type, code: error.code, message: error.message, ...(error.param ? { param: error.param } : {}), request_id: requestId } };
}

/** Maps any thrown value to the v1 error envelope. Internal details are never exposed. */
export function toV1Error(error: unknown): V1Error {
  if (error instanceof V1Error) return error;
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return new V1Error(400, "invalid_request_error", "parameter_invalid", issue?.message ?? "Invalid request.", issue?.path.join(".") || undefined);
  }
  if (error instanceof SyntaxError) return new V1Error(400, "invalid_request_error", "invalid_json", "The request body is not valid JSON.");
  if (error instanceof ApiError) {
    const type: ApiErrorType = error.status === 429 ? "rate_limit_error" : error.status >= 500 ? "api_error" : "invalid_request_error";
    return new V1Error(error.status, type, error.code, error.message);
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new V1Error(504, "api_error", "upstream_timeout", "An upstream service did not respond in time. Retry the request.");
  }
  return new V1Error(500, "api_error", "internal_error", "Something went wrong. Retry the request; if it keeps failing, contact support with the request id.");
}

async function authenticate(request: Request): Promise<Omit<ApiContext, "requestId" | "origin">> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(sk_(test|live)_[A-Za-z0-9_-]{20,})$/.exec(header.trim());
  if (!match) throw new V1Error(401, "authentication_error", "api_key_missing", "Provide a secret API key as `Authorization: Bearer sk_…`.");
  const [, secret, keyEnvironment] = match;
  if (keyEnvironment !== deploymentEnvironment()) {
    throw new V1Error(401, "authentication_error", "api_key_environment_mismatch", `This is the ${deploymentEnvironment()} API; use an sk_${deploymentEnvironment()}_ key.`);
  }
  const rows = await callRpc<Array<{ key_id: string; merchant_id: string; environment: ApiEnvironment; scopes: string[] }>>("authenticate_api_key", { p_key_hash: hashApiKey(secret) });
  const key = rows?.[0];
  if (!key || key.environment !== keyEnvironment) throw new V1Error(401, "authentication_error", "api_key_invalid", "The API key is invalid, expired, or revoked.");
  return { merchantId: key.merchant_id, keyId: key.key_id, environment: key.environment, scopes: key.scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)) };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

type HandlerResult = { status?: number; body: unknown } | { raw: Response };
type Handler<Body> = (context: ApiContext, input: { body: Body; request: Request; params: Record<string, string> }) => Promise<HandlerResult>;

/**
 * Wraps a v1 endpoint: request id, authentication, scope and rate checks, body validation,
 * idempotency (for writes that send Idempotency-Key), structured logging, and error mapping.
 */
export function v1Endpoint<Schema extends ZodTypeAny | undefined = undefined>(
  options: { scope: ApiScope; schema?: Schema; idempotent?: boolean },
  handler: Handler<Schema extends ZodTypeAny ? ZodInfer<Schema> : undefined>
) {
  return async (request: Request, route: { params?: Record<string, string> } = {}) => {
    const requestId = newRequestId();
    const startedAt = Date.now();
    const url = new URL(request.url);
    const routeLabel = `${request.method} ${url.pathname}`;
    let context: ApiContext | null = null;
    let status = 500;
    try {
      if (!isSupabaseConfigured()) throw new V1Error(503, "api_error", "service_unavailable", "The API is temporarily unavailable.");
      context = { ...(await authenticate(request)), requestId, origin: publicOrigin(request) };
      if (!context.scopes.includes(options.scope)) {
        throw new V1Error(403, "permission_error", "insufficient_scope", `This API key is missing the ${options.scope} scope.`);
      }
      const allowed = await callRpc<boolean>("take_rate_limit", { p_key: `api:${context.keyId}`, p_limit: 100, p_window_seconds: 10 });
      if (allowed !== true) throw new V1Error(429, "rate_limit_error", "rate_limited", "Too many requests. Slow down and retry after a few seconds.");

      let rawBody: unknown = undefined;
      if (options.schema) {
        const text = await request.text();
        rawBody = text ? JSON.parse(text) : {};
      }
      const body = (options.schema ? options.schema.parse(rawBody) : undefined) as Schema extends ZodTypeAny ? ZodInfer<Schema> : undefined;

      const idempotencyKey = options.idempotent ? request.headers.get("idempotency-key")?.trim() : null;
      if (idempotencyKey !== null && idempotencyKey !== undefined) {
        if (!idempotencyKey || idempotencyKey.length > 255) throw new V1Error(400, "invalid_request_error", "idempotency_key_invalid", "Idempotency-Key must be 1–255 characters.");
        const requestHash = createHash("sha256").update(`${routeLabel}\n${stableStringify(rawBody ?? null)}`).digest("hex");
        const claim = await callRpc<{ state: string; id?: number; status?: number; body?: unknown }>("begin_idempotent_request", {
          p_merchant_id: context.merchantId, p_environment: context.environment, p_key: idempotencyKey, p_route: routeLabel, p_request_hash: requestHash, p_lease_seconds: 60,
        });
        if (claim.state === "replay") {
          status = claim.status ?? 200;
          return v1Json(claim.body, requestId, { status, headers: { "Idempotent-Replayed": "true" } });
        }
        if (claim.state === "mismatch") throw new V1Error(422, "idempotency_error", "idempotency_key_reused", "This Idempotency-Key was already used with a different request.");
        if (claim.state === "in_progress") throw new V1Error(409, "idempotency_error", "idempotency_key_in_use", "A request with this Idempotency-Key is still being processed. Retry shortly.");
        try {
          const result = await handler(context, { body, request, params: route.params ?? {} });
          if ("raw" in result) throw new Error("Idempotent endpoints must return JSON.");
          status = result.status ?? 200;
          await callRpc("complete_idempotent_request", { p_id: claim.id, p_status: status, p_body: result.body });
          return v1Json(result.body, requestId, { status });
        } catch (error) {
          const mapped = toV1Error(error);
          // Deterministic client errors are stored so a retry sees the same answer; transient
          // failures release the key so the client can safely retry.
          if (mapped.status < 500 && mapped.status !== 429 && mapped.status !== 409) {
            await callRpc("complete_idempotent_request", { p_id: claim.id, p_status: mapped.status, p_body: errorBody(mapped, requestId) });
          } else {
            await callRpc("release_idempotent_request", { p_id: claim.id }).catch(() => undefined);
          }
          throw mapped;
        }
      }

      const result = await handler(context, { body, request, params: route.params ?? {} });
      if ("raw" in result) {
        // Non-JSON responses (for example CSV) still carry the request id.
        status = result.raw.status;
        result.raw.headers.set("Request-Id", requestId);
        return result.raw;
      }
      status = result.status ?? 200;
      return v1Json(result.body, requestId, { status });
    } catch (error) {
      const mapped = toV1Error(error);
      status = mapped.status;
      if (status >= 500) logEvent("api.error", { request_id: requestId, route: routeLabel, error: error instanceof Error ? error.name : "unknown" }, "error");
      return v1Json(errorBody(mapped, requestId), requestId, { status });
    } finally {
      logEvent("api.request", {
        request_id: requestId, route: routeLabel, status, duration_ms: Date.now() - startedAt,
        merchant_id: context?.merchantId, api_key_id: context?.keyId, environment: context?.environment,
      }, status >= 500 ? "error" : "info");
    }
  };
}

// Cursor pagination -----------------------------------------------------------------------------

export type Page = { limit: number; startingAfter: { createdAt: string; id: string } | null };

/** Parses ?limit (1–100, default 20) and ?starting_after (opaque cursor from next_cursor). */
export function readPage(request: Request): Page {
  const url = new URL(request.url);
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? 20 : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new V1Error(400, "invalid_request_error", "parameter_invalid", "limit must be an integer from 1 to 100.", "limit");
  const cursor = url.searchParams.get("starting_after");
  if (!cursor) return { limit, startingAfter: null };
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof createdAt !== "string" || typeof id !== "string" || !Number.isFinite(Date.parse(createdAt))) throw new Error("bad cursor");
    return { limit, startingAfter: { createdAt, id } };
  } catch {
    throw new V1Error(400, "invalid_request_error", "parameter_invalid", "starting_after is not a valid cursor.", "starting_after");
  }
}

export function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify([createdAt, id]), "utf8").toString("base64url");
}

/** PostgREST filters for keyset pagination ordered by (created_at desc, id desc). */
export function pageQuery(page: Page) {
  const query: Record<string, string | number> = { order: "created_at.desc,id.desc", limit: page.limit + 1 };
  if (page.startingAfter) {
    const { createdAt, id } = page.startingAfter;
    query.or = `(created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id}))`;
  }
  return query;
}

export function listResponse<Row extends Record<string, any>>(rows: Row[], page: Page, serialize: (row: Row) => unknown, url: string) {
  const hasMore = rows.length > page.limit;
  const data = rows.slice(0, page.limit);
  const last = data[data.length - 1];
  return {
    object: "list",
    url,
    data: data.map(serialize),
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(String(last.created_at), String(last.id)) : null,
  };
}

export function notFound(resource: string, id: string) {
  return new V1Error(404, "invalid_request_error", "resource_missing", `No such ${resource}: '${id}'.`, "id");
}
