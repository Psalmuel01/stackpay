import { v1Endpoint } from "@/lib/server/api/v1";
import { retrieveSettlement } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "settlements:read" }, async (context, { params }) => ({
  body: await retrieveSettlement(context, params.id),
}));
