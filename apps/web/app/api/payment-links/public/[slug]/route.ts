import { publicPaymentLink } from "@/lib/server/public-projections";
import { jsonError, jsonOk } from "@/lib/server/http";
import { getPublicPaymentLinkBySlug } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: { slug: string } }
) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const paymentLink = await getPublicPaymentLinkBySlug(context.params.slug);
    if (!paymentLink) {
      return jsonError(404, "not_found", "Payment link not found.");
    }

    return jsonOk(publicPaymentLink(paymentLink));
  } catch (error) {
    return jsonError(500, "payment_link_lookup_failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
