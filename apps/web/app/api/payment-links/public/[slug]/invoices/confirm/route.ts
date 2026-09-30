import { publicInvoice } from "@/lib/server/public-projections";
import { apiFailure } from "@/lib/server/http";
import { jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { confirmPublicInvoiceCreation, preparePublicInvoiceFromLink } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { syncInvoiceCreationTx } from "@/lib/server/stacks-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const payload = await request.json();
    if (!payload.txId) {
      return jsonError(400, "invalid_request", "txId is required.");
    }

    const prepared = await preparePublicInvoiceFromLink({ ...payload, slug: (await context.params).slug });
    const sync = await syncInvoiceCreationTx(payload.txId, prepared.contractIntent);
    logTransactionResponse("payment-link.invoice.confirm.sync", {
      slug: (await context.params).slug,
      txId: payload.txId,
      sync,
    });

    if (sync.status === "pending") {
      return jsonOk({
        invoice: null,
        sync: {
          status: "pending",
          onchainInvoiceId: null,
        },
      });
    }

    if (sync.status !== "success" || !sync.onchainId) {
      return jsonOk({
        invoice: null,
        sync: {
          status: sync.status,
          onchainInvoiceId: null,
          result: sync.resultRepr,
        },
      });
    }

    const invoice = await confirmPublicInvoiceCreation({
      slug: (await context.params).slug,
      txId: sync.txId,
      onchainId: sync.onchainId,
      amount: payload.amount,
      currency: payload.currency,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      description: prepared.invoice.description,
      expiresInSeconds: prepared.invoice.expires_in_seconds,
      confirmedAt: sync.confirmedAt,
    });

    const responsePayload = {
      invoice: publicInvoice(invoice),
      sync: {
        status: "success",
        onchainInvoiceId: sync.onchainId,
        result: sync.resultRepr,
      },
    };
    logTransactionResponse("payment-link.invoice.confirm.response", responsePayload);
    return jsonOk(responsePayload);
  } catch (error) {
    return apiFailure(error);
  }
}
