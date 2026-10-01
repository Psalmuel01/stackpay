import { z } from "zod";
import { validateStacksAddress } from "@stacks/transactions";
import { toAtomicAmount } from "../../amounts";

export const currencySchema = z.enum(["STX", "sBTC", "USDCx"], {
  errorMap: () => ({ message: "currency must be one of STX, sBTC, USDCx" }),
});

/** Decimal amount as a string (preferred) or number, exact to the currency's precision. */
export const amountSchema = z.union([z.string(), z.number()]).transform((value) => String(value).trim());

/**
 * Metadata: a flat map of string values for correlating StackPay objects with your own records
 * (order id, customer id, cart id). Up to 50 keys; keys ≤ 40 characters; values ≤ 500 characters.
 */
export const metadataSchema = z
  .record(z.string().min(1, "metadata keys must not be empty").max(40, "metadata keys must be at most 40 characters"), z.string().max(500, "metadata values must be at most 500 characters"), {
    invalid_type_error: "metadata must be an object of string values",
  })
  .refine((value) => Object.keys(value).length <= 50, { message: "metadata may contain at most 50 keys" })
  .default({});

export const stacksAddressSchema = z.string().refine((value) => {
  try {
    return validateStacksAddress(value);
  } catch {
    return false;
  }
}, { message: "must be a valid Stacks address" });

export const httpsUrlSchema = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, { message: "must be an https URL without credentials" });

/**
 * Where the hosted checkout sends the payer after a confirmed payment. https only, no credentials;
 * normalized so the stored form always has a path. Never treat arrival at this URL as proof of
 * payment: confirm with the API or the invoice.paid webhook.
 */
export const successUrlSchema = httpsUrlSchema.transform((value) => new URL(value).toString()).optional();

/** Validates amount against currency precision and range; returns the canonical decimal string. */
export function exactAmount<T extends { amount: string; currency: "STX" | "sBTC" | "USDCx" }>(value: T, ctx: z.RefinementCtx) {
  try {
    toAtomicAmount(value.amount, value.currency);
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: `amount ${error instanceof Error ? error.message.replace(/\.$/, "").toLowerCase() : "is invalid"}` });
  }
}

export const createInvoiceSchema = z
  .object({
    amount: amountSchema,
    currency: currencySchema,
    description: z.string().max(256, "description must be at most 256 characters").default(""),
    metadata: metadataSchema,
    success_url: successUrlSchema,
    expires_in: z.number().int().min(300, "expires_in must be at least 300 seconds").max(2_592_000, "expires_in must be at most 30 days").default(86_400),
    customer: z
      .object({
        name: z.string().max(120).default(""),
        email: z.union([z.literal(""), z.string().email("customer.email must be a valid email").max(254)]).default(""),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine(exactAmount);

export const createPaymentLinkSchema = z
  .object({
    title: z.string().min(1, "title is required").max(128, "title must be at most 128 characters"),
    description: z.string().max(256).default(""),
    currency: currencySchema,
    pricing: z.enum(["fixed", "suggested"]).default("fixed"),
    amount: amountSchema.optional(),
    suggested_amounts: z.array(amountSchema).min(1).max(3).optional(),
    metadata: metadataSchema,
    success_url: successUrlSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.pricing === "fixed") {
      if (!value.amount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "amount is required for fixed pricing" });
      else exactAmount({ amount: value.amount, currency: value.currency }, ctx);
    } else {
      if (!value.suggested_amounts?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suggested_amounts"], message: "suggested_amounts is required for suggested pricing" });
      value.suggested_amounts?.forEach((amount) => exactAmount({ amount, currency: value.currency }, ctx));
    }
  });
