import { consoleRoute } from "@/lib/server/console";
import { replayDelivery } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const POST = consoleRoute(async (merchant, _request, params) => ({
  status: 202,
  body: await replayDelivery(merchant.id, params.id, { type: "wallet", id: merchant.wallet }),
}));
