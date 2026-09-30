import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), selectSingle: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), upsertRow: vi.fn(), isSupabaseConfigured: () => true }));
vi.mock("../lib/server/supabase-admin", () => db);

import { confirmPublicInvoiceCreation } from "../lib/server/stackpay-service";
import { returnUrl } from "../lib/checkout-return";

const link = {
  id: "link-row", public_id: "plink_" + "b".repeat(24), merchant_id: "m1", slug: "tee", title: "Tee", description: "Black tee",
  success_url: "https://shop.example/thanks", draft_contract_call: { arguments: [{ value: "ST1RECIPIENT" }] },
  metadata: { api: { sku: "TEE-BLK-M" }, pricingMode: "fixed", suggestedAmounts: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.selectSingle.mockImplementation(async (table: string) => (table === "payment_links" ? link : table === "merchant_profiles" ? { id: "m1" } : null));
  db.selectRows.mockImplementation(async (table: string) => (table === "payment_links" ? [link] : table === "merchant_profiles" ? [{ id: "m1" }] : []));
  db.callRpc.mockImplementation(async (fn: string) => (fn === "record_invoice_creation" ? { outcome: "created", invoice: { id: "inv-row", merchant_id: "m1", success_url: null } } : null));
});

describe("MultiPay purchases", () => {
  it("carries the link's metadata and identity onto the invoice, and inherits its return URL", async () => {
    const invoice = await confirmPublicInvoiceCreation({ slug: "tee", txId: "0x" + "1".repeat(64), onchainId: "INV_9", amount: 20, currency: "USDCx", expiresInSeconds: 3600 });
    expect(db.callRpc).toHaveBeenCalledWith("record_invoice_creation", expect.objectContaining({
      p_metadata: { sku: "TEE-BLK-M", payment_link: link.public_id, paymentLinkSlug: "tee" },
    }));
    expect(db.patchRows).toHaveBeenCalledWith("invoices", { id: "eq.inv-row", success_url: "is.null" }, { success_url: "https://shop.example/thanks" });
    expect(invoice.success_url).toBe("https://shop.example/thanks");
  });
});

describe("checkout return URL", () => {
  it("appends the invoice id and refuses anything but plain https", () => {
    expect(returnUrl("https://shop.example/thanks?o=7", "inv_1")?.toString()).toBe("https://shop.example/thanks?o=7&stackpay_invoice=inv_1");
    expect(returnUrl("javascript:alert(1)", "inv_1")).toBeNull();
    expect(returnUrl("http://shop.example/", "inv_1")).toBeNull();
    expect(returnUrl("https://a:b@shop.example/", "inv_1")).toBeNull();
    expect(returnUrl(null, "inv_1")).toBeNull();
  });
});
