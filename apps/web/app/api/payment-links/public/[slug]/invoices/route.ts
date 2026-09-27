import { publicPaymentLink } from "@/lib/server/public-projections";
import { jsonError, jsonOk } from "@/lib/server/http";
import { preparePublicInvoiceFromLink } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export async function POST(
  request: Request,
  context: { params: { slug: string } }
) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const payload = await request.json();
    const result = await preparePublicInvoiceFromLink({
      slug: context.params.slug,
      amount: payload.amount,
      currency: payload.currency,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      description: payload.description,
      expiresInSeconds: payload.expiresInSeconds,
    });
    return jsonOk({ ...result, paymentLink: publicPaymentLink(result.paymentLink) }, { status: 201 });
  } catch (error) {
    return jsonError(500, "public_invoice_prepare_failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
