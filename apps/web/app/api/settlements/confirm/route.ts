import { jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { confirmSettlementWithdrawal } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { syncTransaction } from "@/lib/server/stacks-api";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const payload = await request.json();
    if (!payload.txId) {
      return jsonError(400, "invalid_request", "txId is required.");
    }

    const sync = await syncTransaction(payload.txId);
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
      txId: payload.txId,
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
    return jsonError(500, "settlement_confirm_failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
