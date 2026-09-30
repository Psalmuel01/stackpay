import { v1Endpoint, readPage } from "@/lib/server/api/v1";
import { createPaymentLinkSchema } from "@/lib/server/api/schemas";
import { createPaymentLink, listPaymentLinks } from "@/lib/server/api/resources";

export const dynamic = "force-dynamic";

export const GET = v1Endpoint({ scope: "payment_links:read" }, async (context, { request }) => ({
  body: await listPaymentLinks(context, readPage(request)),
}));

/**
 * Create a MultiPay payment link as a draft. Activating it creates the link on-chain, which needs
 * the merchant's wallet signature, so activation happens in the console (activation_url).
 */
export const POST = v1Endpoint({ scope: "payment_links:write", schema: createPaymentLinkSchema, idempotent: true }, async (context, { body }) => ({
  status: 201,
  body: await createPaymentLink(context, body),
}));
