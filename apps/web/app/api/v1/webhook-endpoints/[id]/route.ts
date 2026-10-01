import { v1Endpoint } from "@/lib/server/api/v1";
import { deleteEndpoint, retrieveEndpoint, updateEndpoint, updateEndpointSchema } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "webhooks:read" }, async (context, { params }) => ({
  body: await retrieveEndpoint(context.merchantId, params.id),
}));

export const PATCH = v1Endpoint({ scope: "webhooks:write", schema: updateEndpointSchema, idempotent: true }, async (context, { body, params }) => ({
  body: await updateEndpoint(context.merchantId, params.id, body, { type: "api_key", id: context.keyId, requestId: context.requestId }),
}));

export const DELETE = v1Endpoint({ scope: "webhooks:write", idempotent: true }, async (context, { params }) => ({
  body: await deleteEndpoint(context.merchantId, params.id, { type: "api_key", id: context.keyId, requestId: context.requestId }),
}));
