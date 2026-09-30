import { apiFailure, jsonOk } from "@/lib/server/http";
import { prepareDraftCheckout } from "@/lib/server/draft-checkout";
import { clientAddress, takeRateLimit } from "@/lib/server/wallet-auth";

export const dynamic = "force-dynamic";

/** Public: builds the customer's transaction that creates the on-chain invoice for a draft. */
export async function POST(request: Request, context: { params: { invoiceId: string } }) {
  try {
    await takeRateLimit(`checkout:${clientAddress(request)}`, 30, 60);
    return jsonOk(await prepareDraftCheckout(context.params.invoiceId));
  } catch (error) {
    return apiFailure(error);
  }
}
