import { requireMerchant } from "@/lib/server/wallet-auth";
import { apiFailure } from "@/lib/server/http";
import { jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { confirmPaymentLinkChain, getOwnedPaymentLinkIntent } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { syncInvoiceCreationTx } from "@/lib/server/stacks-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentLinkId: string }> }
) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const authenticatedWallet = await requireMerchant(request);
    const payload = await request.json();
    payload.walletAddress = authenticatedWallet;
    if (!payload.txId) return jsonError(400, "invalid_request", "txId is required.");
    const intent = await getOwnedPaymentLinkIntent((await context.params).paymentLinkId, authenticatedWallet);
    const sync = await syncInvoiceCreationTx(payload.txId, intent);
    if (sync.status === "pending") return jsonOk({ onchain_link_id: null, sync: { status: "pending" } });
    if (sync.status !== "success" || !sync.onchainId) return jsonError(422, "payment_link_chain_failed", "Payment link transaction failed.");
    const onchainLinkId = sync.onchainId;

    const paymentLink = await confirmPaymentLinkChain({
      id: (await context.params).paymentLinkId,
      txId: sync.txId,
      onchainId: onchainLinkId,
    });
    logTransactionResponse("payment-link.chain.response", {
      paymentLinkId: (await context.params).paymentLinkId,
      paymentLink,
    });
    return jsonOk(paymentLink);
  } catch (error) {
    return apiFailure(error);
  }
}
