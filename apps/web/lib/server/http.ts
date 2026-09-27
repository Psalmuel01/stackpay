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

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return jsonError(error.status, error.code, error.message);
  if (error instanceof SyntaxError) return jsonError(400, "invalid_json", "Invalid JSON request.");
  console.error("[stackpay:api]", error instanceof Error ? error.name : "Unknown error");
  return jsonError(500, "request_failed", "The request could not be completed.");
}
