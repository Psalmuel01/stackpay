import { buildCreateInvoiceIntent } from "@/lib/server/stackpay-contracts";
import { requireMerchant } from "@/lib/server/wallet-auth";
import { apiFailure } from "@/lib/server/http";
import { jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { confirmInvoiceCreation } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { syncInvoiceCreationTx } from "@/lib/server/stacks-api";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const authenticatedWallet = await requireMerchant(request);
    const payload = await request.json();
    payload.walletAddress = authenticatedWallet;
    if (!payload.txId) {
      return jsonError(400, "invalid_request", "txId is required.");
    }

    const sync = await syncInvoiceCreationTx(payload.txId, { ...buildCreateInvoiceIntent(payload), sender: authenticatedWallet });
    logTransactionResponse("invoice.confirm.sync", {
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

    const invoice = await confirmInvoiceCreation({
      walletAddress: payload.walletAddress,
      txId: sync.txId,
      onchainId: sync.onchainId,
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      recipientAddress: payload.recipientAddress,
      expiresInSeconds: payload.expiresInSeconds,
      confirmedAt: sync.confirmedAt,
    });

    const responsePayload = {
      invoice,
      sync: {
        status: "success",
        onchainInvoiceId: sync.onchainId,
        result: sync.resultRepr,
      },
    };
    logTransactionResponse("invoice.confirm.response", responsePayload);
    return jsonOk(responsePayload);
  } catch (error) {
    return apiFailure(error);
  }
}
