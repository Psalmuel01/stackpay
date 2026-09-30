import { consoleRoute } from "@/lib/server/console";
import { readJsonObject } from "@/lib/server/request-body";
import { deleteEndpoint, updateEndpoint, updateEndpointSchema } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const PATCH = consoleRoute(async (merchant, request, params) => ({
  body: await updateEndpoint(merchant.id, params.id, updateEndpointSchema.parse(await readJsonObject(request)), { type: "wallet", id: merchant.wallet }),
}));

export const DELETE = consoleRoute(async (merchant, _request, params) => ({
  body: await deleteEndpoint(merchant.id, params.id, { type: "wallet", id: merchant.wallet }),
}));
