import { publicInvoice } from "@/lib/server/public-projections";
import { jsonError, jsonOk } from "@/lib/server/http";
import { getInvoiceDetailsByOnchainId } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> }
) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const invoice = await getInvoiceDetailsByOnchainId((await context.params).invoiceId);
    if (!invoice) {
      return jsonError(404, "not_found", "Invoice not found.");
    }

    return jsonOk(publicInvoice(invoice));
  } catch (error) {
    return jsonError(500, "invoice_lookup_failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
