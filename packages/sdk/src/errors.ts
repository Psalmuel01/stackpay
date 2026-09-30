/** Every error the SDK throws is a StackPayError. Branch on `type`/`code` or use instanceof. */
export class StackPayError extends Error {
  readonly type: string;
  readonly code: string | undefined;
  readonly param: string | undefined;
  readonly statusCode: number | undefined;
  readonly requestId: string | undefined;

  constructor(message: string, details: { type: string; code?: string; param?: string; statusCode?: number; requestId?: string }) {
    super(message);
    this.name = new.target.name;
    this.type = details.type;
    this.code = details.code;
    this.param = details.param;
    this.statusCode = details.statusCode;
    this.requestId = details.requestId;
  }
}

/** The API key is missing, invalid, revoked, or for the other environment. */
export class AuthenticationError extends StackPayError {}
/** The key lacks the scope this endpoint needs. */
export class PermissionError extends StackPayError {}
/** The request was invalid (bad parameter, unknown id, state conflict). */
export class InvalidRequestError extends StackPayError {}
/** An Idempotency-Key was reused with a different request, or is still in use. */
export class IdempotencyError extends StackPayError {}
/** Too many requests; retried automatically before this is thrown. */
export class RateLimitError extends StackPayError {}
/** StackPay failed to complete the request; retried automatically where safe. */
export class APIError extends StackPayError {}
/** The request could not reach StackPay (network failure or timeout). */
export class APIConnectionError extends StackPayError {}
/** A webhook signature did not verify. */
export class SignatureVerificationError extends StackPayError {}

export function errorFromResponse(status: number, body: unknown, requestId: string | undefined): StackPayError {
  const error = (body as { error?: Record<string, string> } | null)?.error ?? {};
  const details = { type: error.type ?? "api_error", code: error.code, param: error.param, statusCode: status, requestId: error.request_id ?? requestId };
  const message = error.message ?? `StackPay returned HTTP ${status}.`;
  switch (details.type) {
    case "authentication_error": return new AuthenticationError(message, details);
    case "permission_error": return new PermissionError(message, details);
    case "invalid_request_error": return new InvalidRequestError(message, details);
    case "idempotency_error": return new IdempotencyError(message, details);
    case "rate_limit_error": return new RateLimitError(message, details);
    default: return new APIError(message, details);
  }
}
