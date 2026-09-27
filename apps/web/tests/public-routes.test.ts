import { beforeEach, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({ getInvoiceDetailsByOnchainId: vi.fn(), verifyInvoicePaymentTransaction: vi.fn(), confirmInvoicePayment: vi.fn(), getPublicPaymentLinkBySlug: vi.fn(), preparePublicInvoiceFromLink: vi.fn(), confirmPublicInvoiceCreation: vi.fn() }));
vi.mock("../lib/server/stackpay-service", () => service);
vi.mock("../lib/server/supabase-admin", () => ({ isSupabaseConfigured: () => true }));
vi.mock("../lib/server/stacks-api", () => ({ syncInvoiceCreationTx: vi.fn(async () => ({ status: "success", onchainId: "INV_1", txId: "0xabc", confirmedAt: 1700000000 })) }));
import { GET as invoiceRead } from "../app/api/invoices/[invoiceId]/route";
import { POST as paymentConfirm } from "../app/api/invoices/[invoiceId]/payment/route";
import { GET as linkRead } from "../app/api/payment-links/public/[slug]/route";
import { POST as linkPrepare } from "../app/api/payment-links/public/[slug]/invoices/route";
import { POST as linkConfirm } from "../app/api/payment-links/public/[slug]/invoices/confirm/route";
const privateFields = { customer_email: "private@example.test", customer_name: "Private Person", metadata: { secret: "private-metadata" }, merchant_id: "private-merchant-id" };
const invoice = { ...privateFields, onchain_invoice_id: "INV_1", amount: 1, currency: "STX", status: "paid" };
const link = { ...privateFields, slug: "shop", default_amount: 1, accepted_currencies: ["STX"], draft_contract_call: { sensitive: "private-intent" } };
function post() { return new Request("https://stackpay.test/api/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txId: "0xabc", amount: 1, currency: "STX" }) }); }
beforeEach(() => {
  vi.clearAllMocks();
  service.getInvoiceDetailsByOnchainId.mockResolvedValue(invoice);
  service.verifyInvoicePaymentTransaction.mockResolvedValue({ status: "success", txId: "0xabc", onchainId: "RCP_1", senderAddress: "payer", confirmedAt: 1700000000 });
  service.confirmInvoicePayment.mockResolvedValue(invoice);
  service.getPublicPaymentLinkBySlug.mockResolvedValue(link);
  service.preparePublicInvoiceFromLink.mockResolvedValue({ paymentLink: link, contractIntent: {}, invoice: { amount: 1, currency: "STX", description: "Product", expires_in_seconds: 3600 } });
  service.confirmPublicInvoiceCreation.mockResolvedValue(invoice);
});
it.each([
  ["invoice read", () => invoiceRead(new Request("https://stackpay.test"), { params: { invoiceId: "INV_1" } })],
  ["payment confirmation", () => paymentConfirm(post(), { params: { invoiceId: "INV_1" } })],
  ["link read", () => linkRead(new Request("https://stackpay.test"), { params: { slug: "shop" } })],
  ["link preparation", () => linkPrepare(post(), { params: { slug: "shop" } })],
  ["link invoice confirmation", () => linkConfirm(post(), { params: { slug: "shop" } })],
] as const)("%s does not disclose private rows to an unauthenticated caller", async (_, handler) => {
  const response = await handler();
  expect(response.status).toBeLessThan(300);
  const body = await response.text();
  for (const marker of ["private@example.test", "Private Person", "private-metadata", "private-merchant-id", "private-intent"]) expect(body).not.toContain(marker);
  expect(body).toContain("STX");
});
