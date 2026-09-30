import { v1Endpoint } from "@/lib/server/api/v1";
import { sendPing } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

/** Queues a signed stackpay.ping event to this endpoint only. */
export const POST = v1Endpoint({ scope: "webhooks:write" }, async (context, { params }) => ({
  status: 202,
  body: await sendPing(context.merchantId, params.id),
}));
