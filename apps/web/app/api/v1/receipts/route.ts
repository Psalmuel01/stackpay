import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { listReceipts } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "receipts:read" }, async (context, { request }) => ({
  body: await listReceipts(context, readPage(request)),
}));
