import { v1Endpoint } from "@/lib/server/api/v1";
import { rotateEndpointSecret } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const POST = v1Endpoint({ scope: "webhooks:write", idempotent: true }, async (context, { params }) => ({
  body: await rotateEndpointSecret(context.merchantId, params.id, { type: "api_key", id: context.keyId, requestId: context.requestId }),
}));
