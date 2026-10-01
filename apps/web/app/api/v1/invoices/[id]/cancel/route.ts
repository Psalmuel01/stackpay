import { v1Endpoint } from "@/lib/server/api/v1";
import { cancelInvoice } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

/** Cancel a draft invoice. Invoices already created on-chain cannot be canceled. */
export const POST = v1Endpoint({ scope: "invoices:write", idempotent: true }, async (context, { params }) => ({
  body: await cancelInvoice(context, params.id),
}));
