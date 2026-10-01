import { v1Endpoint } from "@/lib/server/api/v1";
import { retrieveEvent } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "events:read" }, async (context, { params }) => ({
  body: await retrieveEvent(context, params.id),
}));
