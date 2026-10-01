import { v1Endpoint } from "@/lib/server/api/v1";
import { retrieveDelivery } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "webhooks:read" }, async (context, { params }) => ({
  body: await retrieveDelivery(context.merchantId, params.id),
}));
