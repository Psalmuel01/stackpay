import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ selectRows: vi.fn(), patchRows: vi.fn(), insertRow: vi.fn(), upsertRow: vi.fn(), supabaseRequest: vi.fn(), callRpc: vi.fn().mockResolvedValue(0) }));
vi.mock("../lib/server/supabase-admin", () => db);
import { confirmInvoiceCreation, getOwnedPaymentLinkIntent, verifyInvoicePaymentTransaction } from "../lib/server/stackpay-service";
const wallet = "ST000000000000000000002AMW42H";
const creation = { walletAddress: wallet, txId: "0x" + "a".repeat(64), onchainId: "INV_1", amount: 1, currency: "STX" as const, description: "Invoice", recipientAddress: wallet, expiresInSeconds: 3600, confirmedAt: 1700000000 };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID", `${wallet}.architecture`);
  db.patchRows.mockResolvedValue([]); db.insertRow.mockResolvedValue({}); db.upsertRow.mockResolvedValue({});
});
describe("financial persistence", () => {
  it("preserves an existing paid invoice on creation replay", async () => {
    const paid = { id: "invoice", merchant_id: "merchant", tx_id: creation.txId, status: "paid", paid_at: "2026-01-01" };
    db.selectRows.mockImplementation(async table => table === "merchant_profiles" ? [{ id: "merchant" }] : [paid]);
    db.supabaseRequest.mockResolvedValue([]);
    expect(await confirmInvoiceCreation(creation)).toEqual(paid);
    expect(db.supabaseRequest).toHaveBeenCalledWith("invoices", expect.objectContaining({ prefer: "resolution=ignore-duplicates,return=representation" }));
    expect(db.upsertRow).not.toHaveBeenCalledWith("invoices", expect.anything(), expect.anything());
  });
  it("rejects a colliding invoice id from another transaction", async () => {
    db.selectRows.mockImplementation(async table => table === "merchant_profiles" ? [{ id: "merchant" }] : [{ merchant_id: "merchant", tx_id: "other" }]);
    db.supabaseRequest.mockResolvedValue([]);
    await expect(confirmInvoiceCreation(creation)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a link belonging to another merchant", async () => {
    db.selectRows.mockImplementation(async table => table === "merchant_profiles" ? [{ id: "owner" }] : [{ merchant_id: "other" }]);
    await expect(getOwnedPaymentLinkIntent("link", wallet)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a saved link intent from a different contract deployment", async () => {
    db.selectRows.mockImplementation(async table => table === "merchant_profiles" ? [{ id: "owner" }] : [{ merchant_id: "owner", draft_contract_call: { contractId: `${wallet}.old`, functionName: "create-multipay-link" } }]);
    await expect(getOwnedPaymentLinkIntent("link", wallet)).rejects.toMatchObject({ status: 409 });
  });
  it("does not check payment transactions for a nonexistent invoice", async () => {
    db.selectRows.mockResolvedValue([]);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInvoicePaymentTransaction("missing", creation.txId)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
