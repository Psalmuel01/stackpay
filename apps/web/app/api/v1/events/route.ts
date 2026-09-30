import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { listEvents } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

/** Events are the same objects delivered by webhooks, available for polling and reconciliation. */
export const GET = v1Endpoint({ scope: "events:read" }, async (context, { request }) => ({
  body: await listEvents(context, readPage(request), request),
}));
