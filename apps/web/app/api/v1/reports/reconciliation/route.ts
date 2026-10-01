import { V1Error, v1Endpoint } from "@/lib/server/api/v1";
import { reconciliationCsvStream, validateFilters } from "@/lib/server/reconciliation";

export const dynamic = "force-dynamic";

/**
 * Reconciliation CSV (text/csv). Errors use the JSON envelope.
 * Filters: from, to (ISO dates), status, metadata_keys (comma-separated, adds one column per key).
 */
export const GET = v1Endpoint({ scope: "invoices:read" }, async (context, { request }) => {
  const url = new URL(request.url);
  const filters = { from: url.searchParams.get("from"), to: url.searchParams.get("to"), status: url.searchParams.get("status") };
  const invalid = validateFilters(filters);
  if (invalid) throw new V1Error(400, "invalid_request_error", "parameter_invalid", invalid);
  const metadataKeys = (url.searchParams.get("metadata_keys") ?? "").split(",").map((key) => key.trim()).filter((key) => /^[\w.-]{1,40}$/.test(key)).slice(0, 10);
  return {
    raw: new Response(reconciliationCsvStream(context.merchantId, context.origin, filters, metadataKeys), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
    }),
  };
});
