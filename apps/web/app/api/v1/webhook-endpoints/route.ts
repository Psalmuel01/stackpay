import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { createEndpoint, createEndpointSchema, listEndpoints } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "webhooks:read" }, async (context, { request }) => ({
  body: await listEndpoints(context.merchantId, readPage(request)),
}));

/** Registers an endpoint. The signing secret is returned only in this response. */
export const POST = v1Endpoint({ scope: "webhooks:write", schema: createEndpointSchema, idempotent: true }, async (context, { body }) => ({
  status: 201,
  body: await createEndpoint(context.merchantId, body, { type: "api_key", id: context.keyId, requestId: context.requestId }),
}));
