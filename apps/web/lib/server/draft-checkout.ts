import { ApiError } from "./api-error";
import { callRpc, selectRows } from "./supabase-admin";
import { buildCreatePublicInvoiceFromLinkIntent } from "./stackpay-contracts";
import { syncInvoiceCreationTx } from "./stacks-api";
import type { Currency } from "./stackpay-service";

/**
 * Checkout for API-created draft invoices.
 *
 * A draft is an off-chain payment request. At checkout the customer's wallet creates the on-chain
 * invoice from the merchant's Universal link (already authorized on-chain by the merchant) with the
 * draft's exact amount and currency and the draft's public id as the description, then pays it.
 * The confirmation step verifies that exact transaction on-chain before binding it to the draft.
 */

type Row = Record<string, any>;
export const PUBLIC_INVOICE_ID = /^inv_[0-9a-f]{24}$/;
const MIN_EXPIRY_SECONDS = 60;

async function loadDraft(publicId: string) {
  if (!PUBLIC_INVOICE_ID.test(publicId)) throw new ApiError(404, "invoice_not_found", "Invoice not found.");
  const rows = (await selectRows("invoices", { select: "*,amount_text:amount::text", public_id: `eq.${publicId}`, limit: 1 })) as Row[];
  const invoice = rows[0];
  if (!invoice) throw new ApiError(404, "invoice_not_found", "Invoice not found.");
  return invoice;
}

async function universalLinkFor(merchantId: string) {
  const rows = (await selectRows("payment_links", {
    select: "onchain_link_id",
    merchant_id: `eq.${merchantId}`,
    is_universal: "eq.true",
    is_active: "eq.true",
    onchain_link_id: "not.is.null",
    order: "created_at.desc",
    limit: 1,
  })) as Row[];
  if (!rows[0]) throw new ApiError(409, "checkout_unavailable", "This merchant cannot accept payments right now. Contact the merchant.");
  return String(rows[0].onchain_link_id);
}

function intentFor(invoice: Row, onchainLinkId: string, expiresInSeconds: number) {
  return buildCreatePublicInvoiceFromLinkIntent({
    onchainLinkId,
    currency: invoice.currency as Currency,
    amount: String(invoice.amount_text ?? invoice.amount),
    expiresInSeconds,
    description: String(invoice.public_id),
  });
}

/** Builds the customer transaction that creates the on-chain invoice for a draft. */
export async function prepareDraftCheckout(publicId: string) {
  const invoice = await loadDraft(publicId);
  if (invoice.status !== "draft") throw new ApiError(409, "invoice_not_draft", `This invoice is ${invoice.status}.`);
  const remaining = invoice.expires_at ? Math.floor((Date.parse(invoice.expires_at) - Date.now()) / 1000) : 86_400;
  if (remaining < MIN_EXPIRY_SECONDS) throw new ApiError(409, "invoice_expired", "This invoice has expired. Ask the merchant for a new one.");
  const onchainLinkId = await universalLinkFor(String(invoice.merchant_id));
  return { contractIntent: intentFor(invoice, onchainLinkId, remaining), expiresInSeconds: remaining };
}

/**
 * Verifies the customer's creation transaction and binds it to the draft. Returns the on-chain
 * invoice id, or a pending/failed status while the transaction is not final.
 */
export async function confirmDraftCheckout(publicId: string, txId: string, expiresInSeconds: number) {
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < MIN_EXPIRY_SECONDS || expiresInSeconds > 2_592_000) {
    throw new ApiError(400, "invalid_request", "expiresInSeconds is invalid.");
  }
  const invoice = await loadDraft(publicId);
  if (invoice.onchain_invoice_id) return { status: "success" as const, onchainInvoiceId: String(invoice.onchain_invoice_id) };

  const onchainLinkId = await universalLinkFor(String(invoice.merchant_id));
  // The transaction must call exactly this link with this amount, currency, expiry, and draft id.
  const sync = await syncInvoiceCreationTx(txId, intentFor(invoice, onchainLinkId, expiresInSeconds));
  if (sync.status === "pending") return { status: "pending" as const, onchainInvoiceId: null };
  if (sync.status !== "success" || !sync.onchainId) return { status: sync.status, onchainInvoiceId: null };

  const confirmedAtMs = sync.confirmedAt ? sync.confirmedAt * 1000 : Date.now();
  const result = await callRpc<{ outcome: string }>("attach_draft_invoice", {
    p_public_id: publicId,
    p_merchant_id: invoice.merchant_id,
    p_onchain_invoice_id: sync.onchainId,
    p_tx_id: sync.txId,
    p_amount: String(invoice.amount_text ?? invoice.amount),
    p_currency: invoice.currency,
    p_expires_at: new Date(confirmedAtMs + expiresInSeconds * 1000).toISOString(),
  });
  if (result.outcome === "conflict") throw new ApiError(409, "invoice_conflict", "A different on-chain invoice is already attached to this invoice.");
  if (result.outcome === "mismatch" || result.outcome === "not_found") throw new ApiError(409, "invoice_mismatch", "The on-chain invoice does not match this payment request.");
  return { status: "success" as const, onchainInvoiceId: sync.onchainId };
}
