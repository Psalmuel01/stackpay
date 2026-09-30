import { apiFailure, jsonOk } from "@/lib/server/http";
import { confirmDraftCheckout } from "@/lib/server/draft-checkout";
import { readJsonObject } from "@/lib/server/request-body";
import { normalizeTransactionId } from "@/lib/transaction-id";
import { ApiError } from "@/lib/server/api-error";
import { clientAddress, takeRateLimit } from "@/lib/server/wallet-auth";

export const dynamic = "force-dynamic";

/** Public: verifies the customer's creation transaction on-chain and attaches it to the draft. */
export async function POST(request: Request, context: { params: { invoiceId: string } }) {
  try {
    const body = await readJsonObject(request);
    const txId = normalizeTransactionId(String(body.txId ?? ""));
    if (!txId) throw new ApiError(400, "invalid_tx_id", "A valid transaction id is required.");
    await takeRateLimit(`checkout:${clientAddress(request)}`, 60, 60);
    return jsonOk(await confirmDraftCheckout(context.params.invoiceId, txId, Number(body.expiresInSeconds)));
  } catch (error) {
    return apiFailure(error);
  }
}
