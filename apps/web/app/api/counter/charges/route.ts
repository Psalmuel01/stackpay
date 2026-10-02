import { z } from "zod";
import { consoleRoute } from "@/lib/server/console";
import { readJsonObject } from "@/lib/server/request-body";
import { ApiError } from "@/lib/server/api-error";
import { createInvoice } from "@/lib/server/api/resources";
import { createInvoiceSchema } from "@/lib/server/api/schemas";
import { V1Error, deploymentEnvironment, newRequestId, publicOrigin } from "@/lib/server/api/v1";

export const dynamic = "force-dynamic";

/** How long a counter QR stays payable: long enough to scan and approve, short enough to be stale-proof. */
const CHARGE_TTL_SECONDS = 900;

const chargeSchema = z.object({ amount: z.string(), currency: z.enum(["STX", "sBTC", "USDCx"]) }).strict();

/**
 * Counter Mode sale: a fixed-amount invoice for exactly what the cashier entered. Unlike the
 * Universal QR page, the customer cannot change the amount: the on-chain invoice must match it
 * and the contract only accepts payment of exactly that amount.
 */
export const POST = consoleRoute(async (merchant, request) => {
  const input = chargeSchema.parse(await readJsonObject(request));
  const body = createInvoiceSchema.parse({
    amount: input.amount,
    currency: input.currency,
    description: "Counter sale",
    metadata: { source: "counter" },
    expires_in: CHARGE_TTL_SECONDS,
  });
  try {
    const invoice = await createInvoice(
      { requestId: newRequestId(), merchantId: merchant.id, keyId: "console", environment: deploymentEnvironment(), scopes: ["invoices:write"], origin: publicOrigin(request) },
      body
    );
    return { status: 201, body: { id: invoice.id, amount: invoice.amount, currency: invoice.currency, checkout_url: invoice.checkout_url, expires_at: invoice.expires_at } };
  } catch (error) {
    if (error instanceof V1Error) throw new ApiError(error.status, error.code, error.message);
    throw error;
  }
});
