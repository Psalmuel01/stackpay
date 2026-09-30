import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), supabaseRequest: vi.fn(), isSupabaseConfigured: () => true }));
const chain = vi.hoisted(() => ({ syncInvoiceCreationTx: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
vi.mock("../lib/server/stacks-api", () => chain);

import { POST as prepare } from "../app/api/invoices/[invoiceId]/checkout/route";
import { POST as confirm } from "../app/api/invoices/[invoiceId]/checkout/confirm/route";

const ID = "inv_" + "c".repeat(24);
const txId = "0x" + "d".repeat(64);
const draft = { id: "row", public_id: ID, merchant_id: "m1", status: "draft", amount: 25, amount_text: "25.00000000", currency: "USDCx", onchain_invoice_id: null, expires_at: new Date(Date.now() + 3600_000).toISOString() };
const post = (path: string, body: unknown = {}) => new Request(`https://stackpay.test${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID", "ST000000000000000000002AMW42H.architecture");
  db.supabaseRequest.mockResolvedValue(true);
  db.selectRows.mockImplementation(async (table: string) => (table === "invoices" ? [draft] : table === "payment_links" ? [{ onchain_link_id: "LNK_9" }] : []));
});

describe("draft checkout", () => {
  it("builds the customer transaction from the merchant's Universal link with the draft's exact terms", async () => {
    const response = await prepare(post(`/api/invoices/${ID}/checkout`), { params: { invoiceId: ID } });
    const { data } = await response.json();
    expect(response.status).toBe(200);
    expect(data.contractIntent.functionName).toBe("create-public-invoice-from-link");
    expect(data.contractIntent.arguments.map((a: { value: string }) => a.value)).toEqual(["LNK_9", "USDCx", "25000000", String(data.expiresInSeconds), ID]);
    expect(data.expiresInSeconds).toBeGreaterThan(3500);
  });

  it("refuses expired and non-draft invoices", async () => {
    db.selectRows.mockImplementation(async (table: string) => (table === "invoices" ? [{ ...draft, expires_at: new Date(Date.now() + 10_000).toISOString() }] : []));
    expect((await prepare(post(`/api/invoices/${ID}/checkout`), { params: { invoiceId: ID } })).status).toBe(409);
    db.selectRows.mockImplementation(async (table: string) => (table === "invoices" ? [{ ...draft, status: "canceled" }] : []));
    expect((await prepare(post(`/api/invoices/${ID}/checkout`), { params: { invoiceId: ID } })).status).toBe(409);
  });

  it("verifies the exact transaction on-chain before attaching it", async () => {
    chain.syncInvoiceCreationTx.mockResolvedValue({ status: "success", txId, onchainId: "INV_77", confirmedAt: 1700000000 });
    db.callRpc.mockResolvedValue({ outcome: "attached" });
    const response = await confirm(post(`/api/invoices/${ID}/checkout/confirm`, { txId, expiresInSeconds: 3600 }), { params: { invoiceId: ID } });
    expect(await response.json()).toMatchObject({ data: { status: "success", onchainInvoiceId: "INV_77" } });
    const expected = chain.syncInvoiceCreationTx.mock.calls[0][1];
    expect(expected.arguments.map((a: { value: string }) => a.value)).toEqual(["LNK_9", "USDCx", "25000000", "3600", ID]);
    expect(db.callRpc).toHaveBeenCalledWith("attach_draft_invoice", expect.objectContaining({ p_public_id: ID, p_merchant_id: "m1", p_onchain_invoice_id: "INV_77", p_tx_id: txId, p_amount: "25.00000000", p_currency: "USDCx" }));
  });

  it("does not attach while the transaction is pending or after it failed", async () => {
    chain.syncInvoiceCreationTx.mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ status: "abort_by_response" });
    for (const status of ["pending", "abort_by_response"]) {
      const response = await confirm(post(`/api/invoices/${ID}/checkout/confirm`, { txId, expiresInSeconds: 3600 }), { params: { invoiceId: ID } });
      expect((await response.json()).data.status).toBe(status);
    }
    expect(db.callRpc).not.toHaveBeenCalled();
  });

  it("rejects malformed input and unknown ids", async () => {
    expect((await confirm(post(`/api/invoices/${ID}/checkout/confirm`, { txId: "nope", expiresInSeconds: 3600 }), { params: { invoiceId: ID } })).status).toBe(400);
    expect((await confirm(post(`/api/invoices/${ID}/checkout/confirm`, { txId, expiresInSeconds: 5 }), { params: { invoiceId: ID } })).status).toBe(400);
    expect((await prepare(post("/api/invoices/INV_x/checkout"), { params: { invoiceId: "INV_x" } })).status).toBe(404);
  });
});
