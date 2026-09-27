import { beforeEach, expect, it, vi } from "vitest";
import { publicInvoice, publicPaymentLink } from "../lib/server/public-projections";
const db = vi.hoisted(() => ({ selectRows: vi.fn(), patchRows: vi.fn(), insertRow: vi.fn(), upsertRow: vi.fn(), supabaseRequest: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
import { getReceiptDetailsByReceiptId } from "../lib/server/stackpay-service";
import { buildReceiptPdf } from "../lib/server/receipt-pdf";
const privateFields = { customer_name: "Private Customer", customer_email: "customer@example.test", merchant_id: "internal-merchant", metadata: { secret: "private-order" } };
it("public invoices retain payment facts but never contact or future private columns", () => {
  const result = publicInvoice({ ...privateFields, onchain_invoice_id: "INV_1", amount: "0.12345678", currency: "sBTC", status: "pending", future_secret: "secret", merchant: { company_name: "Store", email: "merchant@example.test" } });
  expect(result).toEqual({ onchain_invoice_id: "INV_1", amount: "0.12345678", currency: "sBTC", status: "pending", merchant: { company_name: "Store" }, receipt: null });
});
it("public links allow only checkout pricing metadata", () => {
  const result = publicPaymentLink({ ...privateFields, slug: "store", draft_contract_call: { private: true }, metadata: { suggestedAmounts: [1, 2], pricingMode: "suggested", orderId: "private-order" }, merchant: { company_name: "Store", settlement_wallet: "private-treasury", email: "merchant@example.test" } });
  expect(result).toEqual({ slug: "store", metadata: { suggestedAmounts: [1, 2], pricingMode: "suggested" }, merchant: { company_name: "Store" } });
});
beforeEach(() => {
  db.selectRows.mockImplementation(async table => {
    if (table === "receipts") return [{ id: "receipt", invoice_id: "invoice", amount: 1, currency: "STX", paid_at: "2026-09-27T00:00:00Z", tx_id: "0x" + "a".repeat(64) }];
    if (table === "invoices") return [{ ...privateFields, onchain_invoice_id: "INV_1", created_at: "2026-09-27T00:00:00Z" }];
    return [{ wallet_address: "owner", email: "merchant@example.test", company_name: "Store", settlement_wallet: "private-treasury" }];
  });
});
it.each([null, "other-wallet"])("receipt viewer %s cannot obtain contact details", async viewer => {
  const receipt = await getReceiptDetailsByReceiptId("RCP_1", viewer);
  expect(receipt?.invoice?.customer_name).toBe("");
  expect(receipt?.invoice?.customer_email).toBe("");
  expect(receipt?.merchant?.email).toBe("");
  const rendered = Buffer.from(buildReceiptPdf(receipt!)).toString("latin1");
  expect(rendered).not.toContain("customer@example.test");
  expect(rendered).not.toContain("Private Customer");
});
it("the authenticated owning merchant retains full receipt contact details", async () => {
  const receipt = await getReceiptDetailsByReceiptId("RCP_1", "owner");
  expect(receipt?.invoice?.customer_email).toBe("customer@example.test");
  expect(receipt?.merchant?.email).toBe("merchant@example.test");
});
