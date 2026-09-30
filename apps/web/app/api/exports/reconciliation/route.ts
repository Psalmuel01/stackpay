import { apiFailure, jsonError } from "@/lib/server/http";
import { requireMerchant, appOrigin } from "@/lib/server/wallet-auth";
import { getMerchantProfileByWallet } from "@/lib/server/stackpay-service";
import { reconciliationCsvStream, validateFilters } from "@/lib/server/reconciliation";

export const dynamic = "force-dynamic";

/** Console CSV export. Filters: from, to (ISO dates), status, metadata_keys (comma-separated). */
export async function GET(request: Request) {
  try {
    const wallet = await requireMerchant(request);
    const merchant = await getMerchantProfileByWallet(wallet);
    if (!merchant) return jsonError(409, "merchant_profile_required", "Complete your merchant profile first.");
    const url = new URL(request.url);
    const filters = { from: url.searchParams.get("from"), to: url.searchParams.get("to"), status: url.searchParams.get("status") };
    const invalid = validateFilters(filters);
    if (invalid) return jsonError(400, "invalid_request", invalid);
    const metadataKeys = (url.searchParams.get("metadata_keys") ?? "").split(",").map((key) => key.trim()).filter((key) => /^[\w.-]{1,40}$/.test(key)).slice(0, 10);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(reconciliationCsvStream(String(merchant.id), appOrigin(request), filters, metadataKeys), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stackpay-reconciliation-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
