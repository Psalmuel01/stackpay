import type { z } from "zod";
import { callRpc, selectRows } from "../supabase-admin";
import { createPaymentLinkDraft } from "../stackpay-service";
import { type ApiContext, type Page, listResponse, notFound, pageQuery, V1Error } from "./v1";
import type { createInvoiceSchema, createPaymentLinkSchema } from "./schemas";
import {
  INVOICE_COLUMNS,
  PAYMENT_LINK_COLUMNS,
  RECEIPT_COLUMNS,
  REFUND_COLUMNS,
  SETTLEMENT_COLUMNS,
  serializeEvent,
  serializeInvoice,
  serializePaymentLink,
  serializeReceipt,
  serializeRefund,
  serializeSettlement,
} from "./objects";

type Row = Record<string, any>;

/**
 * Merchant-scoped resource access for /api/v1. Every query filters by the API key's merchant, so
 * an id belonging to another merchant is indistinguishable from one that does not exist.
 */

async function one(table: string, query: Record<string, string | number>) {
  const rows = (await selectRows(table, { ...query, limit: 1 })) as Row[] | null;
  return rows?.[0] ?? null;
}

async function merchantOf(context: ApiContext) {
  const merchant = await one("merchant_profiles", { id: `eq.${context.merchantId}`, select: "*" });
  if (!merchant) throw new V1Error(403, "permission_error", "merchant_missing", "The merchant for this API key no longer exists.");
  return merchant;
}

async function receiptsForInvoices(invoiceIds: string[]) {
  if (!invoiceIds.length) return new Map<string, Row>();
  const rows = (await selectRows("receipts", {
    select: RECEIPT_COLUMNS,
    invoice_id: `in.(${invoiceIds.join(",")})`,
    status: "eq.confirmed",
  })) as Row[];
  return new Map(rows.map((row) => [String(row.invoice_id), row]));
}

// Invoices --------------------------------------------------------------------------------------

export async function createInvoice(context: ApiContext, body: z.infer<typeof createInvoiceSchema>) {
  const merchant = await merchantOf(context);
  // Customers create the on-chain invoice at checkout through the merchant's Universal link,
  // so no merchant signature is needed per invoice. The link must exist and be live on-chain.
  const universal = await one("payment_links", {
    select: "id,onchain_link_id,draft_contract_call",
    merchant_id: `eq.${context.merchantId}`,
    is_universal: "eq.true",
    is_active: "eq.true",
    onchain_link_id: "not.is.null",
    order: "created_at.desc",
  });
  if (!universal) {
    throw new V1Error(409, "invalid_request_error", "universal_link_required", "Set up Universal QR in the StackPay console before creating invoices through the API.");
  }
  const recipient = String(universal.draft_contract_call?.arguments?.[0]?.value || merchant.settlement_wallet || merchant.wallet_address);
  const invoice = await callRpc<Row>("create_draft_invoice", {
    p_merchant_id: context.merchantId,
    p_amount: body.amount,
    p_currency: body.currency,
    p_description: body.description,
    p_customer_name: body.customer.name,
    p_customer_email: body.customer.email,
    p_recipient: recipient,
    p_expires_at: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    p_metadata: body.metadata,
    p_success_url: body.success_url ?? null,
  });
  // Re-read with amounts as text so the response is exact.
  const row = await one("invoices", { select: INVOICE_COLUMNS, id: `eq.${invoice.id}` });
  return serializeInvoice(row ?? invoice, context);
}

export async function listInvoices(context: ApiContext, page: Page, request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && !["draft", "pending", "paid", "expired", "canceled", "refunded"].includes(status)) {
    throw new V1Error(400, "invalid_request_error", "parameter_invalid", "status must be draft, pending, paid, expired, canceled, or refunded.", "status");
  }
  await callRpc("expire_due_invoices", { p_merchant_id: context.merchantId, p_onchain_invoice_id: null });
  const rows = (await selectRows("invoices", {
    select: INVOICE_COLUMNS,
    merchant_id: `eq.${context.merchantId}`,
    ...(status ? { status: `eq.${status}` } : {}),
    ...pageQuery(page),
  })) as Row[];
  const receipts = await receiptsForInvoices(rows.slice(0, page.limit).map((row) => String(row.id)));
  return listResponse(rows, page, (row) => serializeInvoice(row, context, receipts.get(String(row.id))), "/api/v1/invoices");
}

export async function retrieveInvoice(context: ApiContext, id: string) {
  if (!/^inv_[0-9a-f]{24}$/.test(id)) throw notFound("invoice", id);
  await callRpc("expire_due_invoices", { p_merchant_id: context.merchantId, p_onchain_invoice_id: null });
  const row = await one("invoices", { select: INVOICE_COLUMNS, public_id: `eq.${id}`, merchant_id: `eq.${context.merchantId}` });
  if (!row) throw notFound("invoice", id);
  const receipts = await receiptsForInvoices([String(row.id)]);
  return serializeInvoice(row, context, receipts.get(String(row.id)));
}

export async function cancelInvoice(context: ApiContext, id: string) {
  const result = await callRpc<{ outcome: string; status?: string }>("cancel_draft_invoice", { p_merchant_id: context.merchantId, p_public_id: id });
  if (result.outcome === "not_found") throw notFound("invoice", id);
  if (result.outcome === "not_cancelable") {
    throw new V1Error(409, "invalid_request_error", "invoice_not_cancelable", `Only draft invoices can be canceled; this invoice is ${result.status}. On-chain invoices expire on their own.`);
  }
  return retrieveInvoice(context, id);
}

// Payment links ----------------------------------------------------------------------------------

export async function createPaymentLink(context: ApiContext, body: z.infer<typeof createPaymentLinkSchema>) {
  const merchant = await merchantOf(context);
  const { paymentLink } = await createPaymentLinkDraft({
    walletAddress: String(merchant.wallet_address),
    kind: "multipay",
    title: body.title,
    description: body.description || body.title,
    defaultCurrency: body.currency,
    defaultAmount: body.pricing === "fixed" && body.amount ? Number(body.amount) : null,
    suggestedAmounts: body.pricing === "suggested" ? (body.suggested_amounts ?? []).map(Number) : [],
    metadata: { api: body.metadata },
    successUrl: body.success_url ?? null,
  });
  const row = await one("payment_links", { select: PAYMENT_LINK_COLUMNS, id: `eq.${paymentLink.id}` });
  return serializePaymentLink(row ?? paymentLink, context);
}

export async function listPaymentLinks(context: ApiContext, page: Page) {
  const rows = (await selectRows("payment_links", { select: PAYMENT_LINK_COLUMNS, merchant_id: `eq.${context.merchantId}`, ...pageQuery(page) })) as Row[];
  return listResponse(rows, page, (row) => serializePaymentLink(row, context), "/api/v1/payment-links");
}

export async function retrievePaymentLink(context: ApiContext, id: string) {
  const row = await one("payment_links", { select: PAYMENT_LINK_COLUMNS, public_id: `eq.${id}`, merchant_id: `eq.${context.merchantId}` });
  if (!row) throw notFound("payment link", id);
  return serializePaymentLink(row, context);
}

// Receipts ---------------------------------------------------------------------------------------

async function invoicesById(ids: string[]) {
  if (!ids.length) return new Map<string, Row>();
  const rows = (await selectRows("invoices", { select: "id,public_id,onchain_invoice_id,metadata", id: `in.(${ids.join(",")})` })) as Row[];
  return new Map(rows.map((row) => [String(row.id), row]));
}

export async function listReceipts(context: ApiContext, page: Page) {
  const rows = (await selectRows("receipts", { select: RECEIPT_COLUMNS, merchant_id: `eq.${context.merchantId}`, ...pageQuery(page) })) as Row[];
  const invoices = await invoicesById(rows.slice(0, page.limit).map((row) => String(row.invoice_id)));
  return listResponse(rows, page, (row) => serializeReceipt(row, context, invoices.get(String(row.invoice_id))), "/api/v1/receipts");
}

export async function retrieveReceipt(context: ApiContext, id: string) {
  const row = await one("receipts", { select: RECEIPT_COLUMNS, public_id: `eq.${id}`, merchant_id: `eq.${context.merchantId}` });
  if (!row) throw notFound("receipt", id);
  const invoices = await invoicesById([String(row.invoice_id)]);
  return serializeReceipt(row, context, invoices.get(String(row.invoice_id)));
}

// Refunds (read-only: refunds are signed by the merchant's wallet in the console) ------------------

export async function listRefunds(context: ApiContext, page: Page) {
  const rows = (await selectRows("refunds", { select: REFUND_COLUMNS, merchant_id: `eq.${context.merchantId}`, ...pageQuery(page) })) as Row[];
  const invoices = await invoicesById(rows.slice(0, page.limit).map((row) => String(row.invoice_id)));
  return listResponse(rows, page, (row) => serializeRefund(row, context, invoices.get(String(row.invoice_id))), "/api/v1/refunds");
}

export async function retrieveRefund(context: ApiContext, id: string) {
  const row = await one("refunds", { select: REFUND_COLUMNS, public_id: `eq.${id}`, merchant_id: `eq.${context.merchantId}` });
  if (!row) throw notFound("refund", id);
  const invoices = await invoicesById([String(row.invoice_id)]);
  return serializeRefund(row, context, invoices.get(String(row.invoice_id)));
}

// Settlements (read-only: API keys never authorize spending) -------------------------------------

export async function listSettlements(context: ApiContext, page: Page) {
  const rows = (await selectRows("settlement_runs", { select: SETTLEMENT_COLUMNS, merchant_id: `eq.${context.merchantId}`, ...pageQuery(page) })) as Row[];
  return listResponse(rows, page, (row) => serializeSettlement(row, context), "/api/v1/settlements");
}

export async function retrieveSettlement(context: ApiContext, id: string) {
  const row = await one("settlement_runs", { select: SETTLEMENT_COLUMNS, public_id: `eq.${id}`, merchant_id: `eq.${context.merchantId}` });
  if (!row) throw notFound("settlement", id);
  return serializeSettlement(row, context);
}

// Events -----------------------------------------------------------------------------------------

export async function listEvents(context: ApiContext, page: Page, request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  if (type && !/^[a-z_]+\.[a-z_.]+$/.test(type)) throw new V1Error(400, "invalid_request_error", "parameter_invalid", "type must look like invoice.paid.", "type");
  const rows = (await selectRows("merchant_events", { select: "*", merchant_id: `eq.${context.merchantId}`, ...(type ? { type: `eq.${type}` } : {}), ...pageQuery(page) })) as Row[];
  return listResponse(rows, page, (row) => serializeEvent(row, context), "/api/v1/events");
}

export async function retrieveEvent(context: ApiContext, id: string) {
  const row = await one("merchant_events", { select: "*", public_id: `eq.${id}`, merchant_id: `eq.${context.merchantId}` });
  if (!row) throw notFound("event", id);
  return serializeEvent(row, context);
}
