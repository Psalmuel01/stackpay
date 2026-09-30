import { randomBytes } from "node:crypto";
import { logEvent } from "./log";
import { ZodError } from "zod";
import { ApiError } from "./api-error";
import { NextResponse } from "next/server";

export function logTransactionResponse(label: string, payload: unknown) {
  // Financial payloads and customer details must not enter application logs.
  if (process.env.NODE_ENV !== "production") console.debug(`[stackpay:tx] ${label}`);
}

export function jsonOk(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json({ data }, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Error envelope with a request id so a user report can be matched to the server log line. */
export function jsonError(status: number, code: string, message: string) {
  const requestId = `req_${randomBytes(12).toString("hex")}`;
  if (status >= 500) logEvent("console.error", { request_id: requestId, status, code }, "error");
  return NextResponse.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
      },
    },
    { status, headers: { "Request-Id": requestId } }
  );
}

export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return jsonError(error.status, error.code, error.message);
  if (error instanceof SyntaxError) return jsonError(400, "invalid_json", "Invalid JSON request.");
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return jsonError(400, "invalid_request", `${field ? `${field}: ` : ""}${issue?.message ?? "Invalid request."}`);
  }
  // fetch aborted by AbortSignal.timeout(): an upstream (chain or database) did not answer in time.
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return jsonError(504, "upstream_timeout", "An upstream service did not respond in time. Try again shortly.");
  }
  const response = jsonError(500, "request_failed", "The request could not be completed. If it keeps happening, contact support with the request id.");
  logEvent("console.unhandled_error", { request_id: response.headers.get("Request-Id"), error: error instanceof Error ? error.name : "unknown" }, "error");
  return response;
}
