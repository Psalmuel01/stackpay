import { v1Endpoint } from "@/lib/server/api/v1";
import { retrievePaymentLink } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "payment_links:read" }, async (context, { params }) => ({
  body: await retrievePaymentLink(context, params.id),
}));
