import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { listRefunds } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "refunds:read" }, async (context, { request }) => ({
  body: await listRefunds(context, readPage(request)),
}));
