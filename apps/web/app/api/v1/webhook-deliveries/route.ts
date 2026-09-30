import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { listDeliveries } from "@/lib/server/webhooks/service";

export const dynamic = "force-dynamic";

/** Filters: endpoint (we_…), status (pending | succeeded | failed | dead). */
export const GET = v1Endpoint({ scope: "webhooks:read" }, async (context, { request }) => {
  const url = new URL(request.url);
  return { body: await listDeliveries(context.merchantId, readPage(request), { endpoint: url.searchParams.get("endpoint"), status: url.searchParams.get("status") }) };
});
