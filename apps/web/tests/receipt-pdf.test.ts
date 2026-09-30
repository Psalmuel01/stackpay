import { describe, expect, it } from "vitest";
import { buildReceiptPdf } from "../lib/server/receipt-pdf";
const fixture = {
  receipt: { onchain_receipt_id: "receipt-123", tx_id: "a".repeat(64), payer_wallet_address: "ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN", paid_at: "2026-09-29T10:30:00Z", amount: 1.123456, currency: "STX" as const },
  invoice: { onchain_invoice_id: "invoice-456", description: "Coffee and pastry", customer_name: "", customer_email: "", recipient_address: "", created_at: "", paid_at: "" }, merchant: null,
};
describe("printable receipts", () => {
  it("retains base-unit precision and complete reconciliation identifiers", () => {
    const pdf = buildReceiptPdf(fixture).toString("binary");
    expect(pdf).toContain("1.123456 STX");
    expect(pdf).toContain(fixture.receipt.payer_wallet_address);
    expect(pdf).toContain("0x" + fixture.receipt.tx_id);
    expect(pdf).toContain("UTC");
    expect(pdf).not.toContain("CUSTOMER EMAIL");
    expect(pdf).toContain("/Subtype /Link");
  });
  it("paginates descriptions without dropping the final words", () => {
    const pdf = buildReceiptPdf({ ...fixture, invoice: { ...fixture.invoice, description: "A detailed purchase description. ".repeat(200) + "FINAL REFERENCE" } }).toString("binary");
    expect(pdf).toContain("REFERENCE");
    expect(pdf).not.toContain("/Count 1 ");
    expect(pdf).toContain("Receipt continued");
  });
  it("handles unavailable dates without breaking receipt download", () => {
    expect(buildReceiptPdf({ ...fixture, receipt: { ...fixture.receipt, paid_at: "invalid" } }).toString("binary")).toContain("Unavailable");
  });
});
