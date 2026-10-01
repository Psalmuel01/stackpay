import { ApiError } from "./api-error";

/**
 * For routes where a body is optional (e.g. POST actions like "send test" or "rotate"): an empty
 * body is an empty object, but a non-empty body must still be a valid JSON object.
 */
export async function readOptionalJsonObject(request: Request): Promise<Record<string, any>> {
  const text = await request.text();
  if (!text.trim()) return {};
  return readJsonObject(new Request(request.url, { method: "POST", body: text }));
}

/** All identity-bearing bodies must be objects; null/arrays are not payloads. */
export async function readJsonObject(request: Request): Promise<Record<string, any>> {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", "A JSON object is required.");
  }
  return value as Record<string, any>;
}
