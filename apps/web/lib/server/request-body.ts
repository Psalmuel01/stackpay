import { ApiError } from "./api-error";

/** All identity-bearing bodies must be objects; null/arrays are not payloads. */
export async function readJsonObject(request: Request): Promise<Record<string, any>> {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", "A JSON object is required.");
  }
  return value as Record<string, any>;
}
