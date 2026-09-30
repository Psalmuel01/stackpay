import { consoleRoute } from "@/lib/server/console";
import { sendPing } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

export const POST = consoleRoute(async (merchant, _request, params) => ({ status: 202, body: await sendPing(merchant.id, params.id) }));
