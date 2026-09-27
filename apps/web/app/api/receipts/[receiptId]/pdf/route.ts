import { getSessionWallet } from "@/lib/server/wallet-auth";
import { buildReceiptPdf } from "@/lib/server/receipt-pdf";
import { getReceiptDetailsByReceiptId } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: { receiptId: string } }
) {
  if (!isSupabaseConfigured()) {
    return new Response("Supabase environment variables are missing.", { status: 503 });
  }

  const receiptData = await getReceiptDetailsByReceiptId(context.params.receiptId, await getSessionWallet(_request));
  if (!receiptData) {
    return new Response("Receipt not found.", { status: 404 });
  }

  const pdf = buildReceiptPdf(receiptData);
  const fileName = `stackpay-receipt-${receiptData.receipt.onchain_receipt_id}.pdf`;

  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
