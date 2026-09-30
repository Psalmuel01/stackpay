import { consoleRoute } from "@/lib/server/console";
import { rotateEndpointSecret } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const POST = consoleRoute(async (merchant, _request, params) => ({
  body: await rotateEndpointSecret(merchant.id, params.id, { type: "wallet", id: merchant.wallet }),
}));
