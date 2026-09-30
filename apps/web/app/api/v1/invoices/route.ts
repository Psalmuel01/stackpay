import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { createInvoiceSchema } from "@/lib/server/api/schemas";
import { createInvoice, listInvoices } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

/** List invoices, newest first. Filters: status. Pagination: limit, starting_after. */
export const GET = v1Endpoint({ scope: "invoices:read" }, async (context, { request }) => ({
  body: await listInvoices(context, readPage(request), request),
}));

/** Create an invoice (a draft payment request with a hosted checkout_url). */
export const POST = v1Endpoint({ scope: "invoices:write", schema: createInvoiceSchema, idempotent: true }, async (context, { body }) => ({
  status: 201,
  body: await createInvoice(context, body),
}));
