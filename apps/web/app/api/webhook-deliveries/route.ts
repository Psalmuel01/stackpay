import { consoleRoute } from "@/lib/server/console";
import { listDeliveries } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = consoleRoute(async (merchant, request) => {
  const url = new URL(request.url);
  return { body: await listDeliveries(merchant.id, { limit: 50, startingAfter: null }, { endpoint: url.searchParams.get("endpoint"), status: url.searchParams.get("status") }) };
});
