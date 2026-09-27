/** Public chain references are enumerable. Never spread database rows into checkout. */
type Row = Record<string, any>;
function pick(row: Row, keys: readonly string[]): Row {
  return Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
}
function merchantBrand(merchant: Row | null | undefined) {
  return merchant ? pick(merchant, ["company_name", "display_name", "slug"]) : null;
}
export function publicInvoice(invoice: Row | null) {
  if (!invoice) return null;
  return {
    ...pick(invoice, ["onchain_invoice_id", "status", "amount", "currency", "description", "recipient_address", "expires_at", "paid_at", "created_at", "tx_id"]),
    merchant: merchantBrand(invoice.merchant),
    receipt: invoice.receipt ? pick(invoice.receipt, ["onchain_receipt_id", "tx_id", "payer_wallet_address", "paid_at"]) : null,
  };
}
export function publicPaymentLink(link: Row) {
  const metadata = link.metadata ?? {};
  return {
    ...pick(link, ["onchain_link_id", "kind", "slug", "title", "description", "accepted_currencies", "default_currency", "default_amount", "amount_step", "allow_custom_amount", "is_universal", "is_active"]),
    merchant: merchantBrand(link.merchant),
    metadata: pick(metadata, ["pricingMode", "suggestedAmounts"]),
  };
}
