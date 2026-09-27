import { publicInvoice } from "@/lib/server/public-projections";
import { jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { confirmInvoicePayment, verifyInvoicePaymentTransaction } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { apiFailure } from "@/lib/server/http";

export async function POST(
  request: Request,
  context: { params: { invoiceId: string } }
) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const payload = await request.json();
    if (!payload.txId) {
      return jsonError(400, "invalid_request", "txId is required.");
    }

    const sync = await verifyInvoicePaymentTransaction(context.params.invoiceId, payload.txId);
    logTransactionResponse("invoice.payment.sync", {
      invoiceId: context.params.invoiceId,
      txId: payload.txId,
      sync,
    });

    if (sync.status === "pending") {
      return jsonOk({
        invoice: null,
        sync: {
          status: "pending",
          receiptId: null,
        },
      });
    }

    if (sync.status !== "success" || !sync.onchainId) {
      return jsonOk({
        invoice: null,
        sync: {
          status: sync.status,
          receiptId: null,
          result: sync.resultRepr,
        },
      });
    }

    const invoice = await confirmInvoicePayment({
      invoiceId: context.params.invoiceId,
      txId: sync.txId,
      receiptId: sync.onchainId,
      payerWalletAddress: sync.senderAddress,
      confirmedAt: sync.confirmedAt,
    });

    const responsePayload = {
      invoice: publicInvoice(invoice),
      sync: {
        status: "success",
        receiptId: sync.onchainId,
      },
    };
    logTransactionResponse("invoice.payment.response", responsePayload);
    return jsonOk(responsePayload);
  } catch (error) {
    return apiFailure(error);
  }
}
