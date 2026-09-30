import { v1Endpoint } from "@/lib/server/api/v1";
import { retrieveRefund } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "refunds:read" }, async (context, { params }) => ({
  body: await retrieveRefund(context, params.id),
}));
