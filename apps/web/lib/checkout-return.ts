/** The merchant's return URL with the paid invoice id appended; null when unusable. */
export function returnUrl(successUrl: string | null | undefined, invoiceId: string | null | undefined) {
  if (!successUrl) return null;
  try {
    const url = new URL(successUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (invoiceId) url.searchParams.set("stackpay_invoice", invoiceId);
    return url;
  } catch {
    return null;
  }
}
