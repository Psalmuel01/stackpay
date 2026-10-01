import { consoleRoute } from "@/lib/server/console";
import { readJsonObject } from "@/lib/server/request-body";
import { listRefunds, prepareRefund, refundAmountSchema } from "@/lib/server/refunds";

export const dynamic = "force-dynamic";

/** Refunds recorded against one of the merchant's invoices. */
export const GET = consoleRoute(async (merchant, _request, params) => ({
  body: { refunds: await listRefunds(merchant, params.invoiceId) },
}));

/** Prepares the exact transfer (merchant wallet → original payer) for the merchant to sign. */
export const POST = consoleRoute(async (merchant, request, params) => ({
  body: await prepareRefund(merchant, params.invoiceId, refundAmountSchema.parse(await readJsonObject(request))),
}));
