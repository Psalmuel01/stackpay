import { decimalToAtomic, sumDecimalAmounts, type PaymentCurrency } from "../../amounts";
import type { ApiEnvironment } from "./v1";

/**
 * Public API object shapes. Amounts are exact decimal strings plus base-unit strings; timestamps
 * are ISO-8601; ids are prefixed public ids. Internal UUIDs and off-chain secrets never appear.
 */

type Row = Record<string, any>;

/** Column list for PostgREST that returns numeric amounts as text (no floating point). */
export const INVOICE_COLUMNS = "*,amount_text:amount::text,refunded_text:refunded_amount::text";
export const RECEIPT_COLUMNS = "*,amount_text:amount::text";
export const SETTLEMENT_COLUMNS = "*,amount_text:amount::text";
export const PAYMENT_LINK_COLUMNS = "*,default_amount_text:default_amount::text";

function canonicalAmount(value: unknown, currency: PaymentCurrency) {
  const text = String(value ?? "0");
  try {
    return sumDecimalAmounts([text], currency);
  } catch {
    return text;
  }
}

function money(value: unknown, currency: PaymentCurrency) {
  const amount = canonicalAmount(value, currency);
  let units: string;
  try {
    units = decimalToAtomic(amount, currency).toString();
  } catch {
    units = "0";
  }
  return { amount, amount_units: units };
}

export function serializeInvoice(row: Row, context: { origin: string; environment: ApiEnvironment }, receipt?: Row | null) {
  const currency = row.currency as PaymentCurrency;
  return {
    id: row.public_id,
    object: "invoice",
    livemode: context.environment === "live",
    status: row.status,
    ...money(row.amount_text ?? row.amount, currency),
    currency,
    amount_refunded: canonicalAmount(row.refunded_text ?? row.refunded_amount ?? "0", currency),
    description: row.description ?? "",
    metadata: row.metadata ?? {},
    customer: { name: row.customer_name ?? "", email: row.customer_email ?? "" },
    recipient: row.recipient_address ?? null,
    checkout_url: `${context.origin}/pay/${row.public_id}`,
    success_url: row.success_url ?? null,
    onchain_invoice_id: row.onchain_invoice_id ?? null,
    creation_tx_id: row.tx_id ?? null,
    expires_at: row.expires_at ?? null,
    paid_at: row.paid_at ?? null,
    canceled_at: row.canceled_at ?? null,
    created_at: row.created_at,
    payment: receipt ? serializePayment(receipt) : null,
  };
}

function serializePayment(receipt: Row) {
  return {
    receipt_id: receipt.public_id,
    onchain_receipt_id: receipt.onchain_receipt_id,
    tx_id: receipt.tx_id,
    payer: receipt.payer_wallet_address ?? null,
    paid_at: receipt.paid_at,
    block_hash: receipt.block_hash ?? null,
    block_height: receipt.block_height ?? null,
    status: receipt.status ?? "confirmed",
  };
}

export function serializeReceipt(row: Row, context: { environment: ApiEnvironment }, invoice?: Row | null) {
  const currency = row.currency as PaymentCurrency;
  return {
    id: row.public_id,
    object: "receipt",
    livemode: context.environment === "live",
    status: row.status ?? "confirmed",
    invoice: invoice?.public_id ?? null,
    onchain_invoice_id: invoice?.onchain_invoice_id ?? null,
    onchain_receipt_id: row.onchain_receipt_id,
    ...money(row.amount_text ?? row.amount, currency),
    currency,
    tx_id: row.tx_id,
    payer: row.payer_wallet_address ?? null,
    block_hash: row.block_hash ?? null,
    block_height: row.block_height ?? null,
    paid_at: row.paid_at,
    orphaned_at: row.orphaned_at ?? null,
    metadata: invoice?.metadata ?? {},
    created_at: row.created_at,
  };
}

export function serializeSettlement(row: Row, context: { environment: ApiEnvironment }) {
  const currency = row.currency as PaymentCurrency;
  return {
    id: row.public_id,
    object: "settlement",
    livemode: context.environment === "live",
    status: row.status === "completed" ? "confirmed" : row.status,
    ...money(row.amount_text ?? row.amount, currency),
    currency,
    destination: row.destination,
    tx_id: row.tx_id,
    executed_at: row.executed_at,
    created_at: row.created_at,
  };
}

export function serializePaymentLink(row: Row, context: { origin: string; environment: ApiEnvironment }) {
  const currency = (row.default_currency ?? null) as PaymentCurrency | null;
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const suggested = Array.isArray(metadata.suggestedAmounts) ? (metadata.suggestedAmounts as unknown[]).map(String) : [];
  const status = !row.onchain_link_id ? "draft" : row.is_active ? "active" : "inactive";
  return {
    id: row.public_id,
    object: "payment_link",
    livemode: context.environment === "live",
    status,
    kind: row.is_universal ? "universal" : row.kind,
    title: row.title,
    description: row.description ?? "",
    currency,
    accepted_currencies: row.accepted_currencies ?? [],
    pricing: suggested.length ? "suggested" : row.allow_custom_amount ? "custom" : "fixed",
    amount: currency && (row.default_amount_text ?? row.default_amount) != null ? canonicalAmount(row.default_amount_text ?? row.default_amount, currency) : null,
    suggested_amounts: currency ? suggested.map((value) => canonicalAmount(value, currency)) : suggested,
    url: status === "draft" ? null : `${context.origin}/pay/link/${row.slug}`,
    activation_url: status === "draft" ? `${context.origin}/payment-links` : null,
    onchain_link_id: row.onchain_link_id ?? null,
    success_url: row.success_url ?? null,
    metadata: typeof metadata.api === "object" && metadata.api ? metadata.api : {},
    created_at: row.created_at,
  };
}

export function serializeEvent(row: Row, context: { environment: ApiEnvironment }) {
  return {
    id: row.public_id,
    object: "event",
    livemode: context.environment === "live",
    type: row.type,
    created_at: row.created_at,
    data: { object: row.data ?? {} },
  };
}
