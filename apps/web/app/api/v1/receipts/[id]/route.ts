import { v1Endpoint } from "@/lib/server/api/v1";
import { retrieveReceipt } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "receipts:read" }, async (context, { params }) => ({
  body: await retrieveReceipt(context, params.id),
}));
