import { v1Endpoint } from "@/lib/server/api/v1";
import { retrieveInvoice } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "invoices:read" }, async (context, { params }) => ({
  body: await retrieveInvoice(context, params.id),
}));
