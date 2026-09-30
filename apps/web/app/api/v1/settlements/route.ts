import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { listSettlements } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

/** Read-only: API keys never authorize withdrawals. */
export const GET = v1Endpoint({ scope: "settlements:read" }, async (context, { request }) => ({
  body: await listSettlements(context, readPage(request)),
}));
