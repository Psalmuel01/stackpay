import { buildWithdrawStxIntent, buildWithdrawTokenIntent } from "@/lib/server/stackpay-contracts";
import { tokenContracts } from "@/lib/server/stacks-api";
import { ApiError } from "@/lib/server/api-error";
import { requireMerchant } from "@/lib/server/wallet-auth";
import { apiFailure } from "@/lib/server/http";
import { jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { confirmSettlementWithdrawal } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { syncTransaction } from "@/lib/server/stacks-api";

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

    if (!["STX", "sBTC", "USDCx"].includes(payload.currency)) throw new ApiError(400, "invalid_currency", "Unsupported currency.");
    const intent = payload.currency === "STX"
      ? buildWithdrawStxIntent({ amount: payload.amount, recipientAddress: payload.destination })
      : buildWithdrawTokenIntent({ currency: payload.currency, amount: payload.amount, recipientAddress: payload.destination, tokenContract: tokenContracts[payload.currency as "sBTC" | "USDCx"] });
    const sync = await syncTransaction(payload.txId, { ...intent, sender: authenticatedWallet });
    logTransactionResponse("settlement.confirm.sync", {
      txId: payload.txId,
      sync,
    });

    if (sync.status === "pending") {
      return jsonOk({
        settlementRun: null,
        sync: {
          status: "pending",
          result: null,
        },
      });
    }

    if (sync.status !== "success") {
      return jsonOk({
        settlementRun: null,
        sync: {
          status: sync.status,
          result: sync.resultRepr ?? sync.reason ?? null,
        },
      });
    }

    const settlementRun = await confirmSettlementWithdrawal({
      walletAddress: payload.walletAddress,
      txId: sync.txId,
      currency: payload.currency,
      amount: payload.amount,
      destination: payload.destination,
      confirmedAt: sync.confirmedAt,
    });

    const responsePayload = {
      settlementRun,
      sync: {
        status: "success",
        result: sync.resultRepr ?? null,
      },
    };
    logTransactionResponse("settlement.confirm.response", responsePayload);
    return jsonOk(responsePayload);
  } catch (error) {
    return apiFailure(error);
  }
}
