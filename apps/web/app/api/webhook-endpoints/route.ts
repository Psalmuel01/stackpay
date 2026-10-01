import { consoleRoute } from "@/lib/server/console";
import { readJsonObject } from "@/lib/server/request-body";
import { createEndpoint, createEndpointSchema, listEndpoints } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = consoleRoute(async (merchant) => ({ body: await listEndpoints(merchant.id, { limit: 50, startingAfter: null }) }));

export const POST = consoleRoute(async (merchant, request) => ({
  status: 201,
  body: await createEndpoint(merchant.id, createEndpointSchema.parse(await readJsonObject(request)), { type: "wallet", id: merchant.wallet }),
}));
