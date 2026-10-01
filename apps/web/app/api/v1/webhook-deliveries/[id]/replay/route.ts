import { v1Endpoint } from "@/lib/server/api/v1";
import { replayDelivery } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const POST = v1Endpoint({ scope: "webhooks:write", idempotent: true }, async (context, { params }) => ({
  status: 202,
  body: await replayDelivery(context.merchantId, params.id, { type: "api_key", id: context.keyId, requestId: context.requestId }),
}));
