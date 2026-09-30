import { consoleRoute } from "@/lib/server/console";
import { readJsonObject } from "@/lib/server/request-body";
import { confirmRefund, confirmRefundSchema } from "@/lib/server/refunds";

export const dynamic = "force-dynamic";

/** Verifies the refund transaction on-chain, then records it. Returns `pending` until anchored. */
export const POST = consoleRoute(async (merchant, request, params) => {
  const result = await confirmRefund(merchant, params.invoiceId, confirmRefundSchema.parse(await readJsonObject(request)));
  return { status: result.status === "pending" ? 202 : 200, body: result };
});
