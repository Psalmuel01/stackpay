import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/server/api-error";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), isSupabaseConfigured: () => true }));
const service = vi.hoisted(() => ({ verifyInvoicePaymentTransaction: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
vi.mock("../lib/server/stackpay-service", () => service);

import { parseChainhookPayload, processChainEventInbox } from "../lib/server/chain-events";
import { POST as webhook } from "../app/api/webhooks/chainhooks/route";

const contract = "ST000000000000000000002AMW42H.architecture";
const txId = "0x" + "a".repeat(64);

function paidOperation(overrides: Record<string, unknown> = {}, index = 3) {
  return {
    type: "contract_log",
    operation_identifier: { index },
    metadata: {
      contract_identifier: contract,
      decoded_value: { event: "invoice-paid", "invoice-id": "INV_1", "receipt-id": "RCP_1", payer: "ST1PAYER", amount: "250000000", currency: "USDCx" },
      ...overrides,
    },
  };
}
function block(hash: string, height: number, operations: unknown[]) {
  return { block_identifier: { hash, index: height }, transactions: [{ transaction_identifier: { hash: txId }, operations }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("parseChainhookPayload", () => {
  it("extracts events with their chain identity, rollbacks first", () => {
    const events = parseChainhookPayload({ event: { apply: [block("0xB2", 11, [paidOperation()])], rollback: [block("0xB1", 10, [paidOperation()])] } }, contract);
    expect(events.map((e) => [e.phase, e.blockHash, e.blockHeight, e.eventIndex])).toEqual([["rollback", "0xB1", 10, 3], ["apply", "0xB2", 11, 3]]);
    expect(events[1]).toMatchObject({ txId, invoiceId: "INV_1", receiptId: "RCP_1", eventName: "invoice-paid", data: { amount: "250000000", currency: "USDCx" } });
  });

  it("ignores events from other contracts and events without a block identity", () => {
    const foreign = paidOperation({ contract_identifier: "ST000000000000000000002AMW42H.imposter" });
    const noContract = paidOperation({ contract_identifier: undefined });
    const noHash = { block_identifier: { index: 12 }, transactions: [{ transaction_identifier: { hash: txId }, operations: [paidOperation()] }] };
    expect(parseChainhookPayload({ event: { apply: [block("0xB3", 12, [foreign, noContract]), noHash], rollback: [] } }, contract)).toEqual([]);
  });

  it("decodes Clarity repr strings", () => {
    const repr = paidOperation({ decoded_value: undefined, value: { repr: '(tuple (event "invoice-paid") (invoice-id "INV_9") (receipt-id "RCP_9") (amount u5))' } });
    const [event] = parseChainhookPayload({ apply: [block("0xB4", 13, [repr])] }, contract);
    expect(event).toMatchObject({ invoiceId: "INV_9", receiptId: "RCP_9", data: expect.objectContaining({ amount: "5" }) });
  });

  it("refuses to parse without a configured contract", () => {
    expect(() => parseChainhookPayload({}, "")).toThrow(/not configured/);
  });
});

describe("processChainEventInbox", () => {
  const applyRow = { id: 7, phase: "apply", event_name: "invoice-paid", tx_id: txId, block_hash: "0xB2", block_height: 11, invoice_onchain_id: "INV_1", receipt_onchain_id: "RCP_1", attempts: 1 };
  const verified = { status: "success", txId, onchainId: "RCP_1", senderAddress: "ST1PAYER", confirmedAt: 1700000000, resultRepr: null, blockHash: "0xB2", blockHeight: 11 };

  function rpc(outcomes: Record<string, unknown>) {
    db.callRpc.mockImplementation(async (fn: string) => (fn in outcomes ? outcomes[fn] : null));
  }

  it("projects a verified payment and completes the event", async () => {
    rpc({ claim_chain_events: [applyRow], project_invoice_payment: "processed" });
    service.verifyInvoicePaymentTransaction.mockResolvedValue(verified);
    expect(await processChainEventInbox()).toEqual({ claimed: 1, processed: 1, retried: 0, dead: 0 });
    expect(db.callRpc).toHaveBeenCalledWith("project_invoice_payment", expect.objectContaining({ p_inbox_id: 7, p_block_hash: "0xB2", p_payer: "ST1PAYER", p_paid_at: new Date(1700000000 * 1000).toISOString() }));
    expect(db.callRpc).toHaveBeenCalledWith("complete_chain_event", { p_id: 7, p_outcome: "processed" });
  });

  it("retries, never succeeds, when the chain is unavailable", async () => {
    rpc({ claim_chain_events: [applyRow], fail_chain_event: "retry" });
    service.verifyInvoicePaymentTransaction.mockRejectedValue(new ApiError(503, "chain_unavailable", "down"));
    expect(await processChainEventInbox()).toMatchObject({ processed: 0, retried: 1 });
    expect(db.callRpc).not.toHaveBeenCalledWith("project_invoice_payment", expect.anything());
    expect(db.callRpc).toHaveBeenCalledWith("fail_chain_event", expect.objectContaining({ p_id: 7, p_max_attempts: 12 }));
  });

  it("retries a transaction that is not yet anchored", async () => {
    rpc({ claim_chain_events: [applyRow], fail_chain_event: "retry" });
    service.verifyInvoicePaymentTransaction.mockResolvedValue({ status: "pending" });
    expect(await processChainEventInbox()).toMatchObject({ retried: 1 });
  });

  it("retries when the invoice has not been recorded yet", async () => {
    rpc({ claim_chain_events: [applyRow], project_invoice_payment: "missing_invoice", fail_chain_event: "retry" });
    service.verifyInvoicePaymentTransaction.mockResolvedValue(verified);
    expect(await processChainEventInbox()).toMatchObject({ retried: 1 });
  });

  it("dead-letters an event whose receipt does not match the verified transaction", async () => {
    rpc({ claim_chain_events: [applyRow], fail_chain_event: "dead" });
    service.verifyInvoicePaymentTransaction.mockResolvedValue({ ...verified, onchainId: "RCP_OTHER" });
    expect(await processChainEventInbox()).toMatchObject({ dead: 1 });
    expect(db.callRpc).toHaveBeenCalledWith("fail_chain_event", expect.objectContaining({ p_max_attempts: 0 }));
  });

  it("dead-letters a failed transaction and a payment conflict", async () => {
    rpc({ claim_chain_events: [applyRow, { ...applyRow, id: 8 }], project_invoice_payment: "conflict", fail_chain_event: "dead" });
    service.verifyInvoicePaymentTransaction.mockResolvedValueOnce({ status: "abort_by_response" }).mockResolvedValueOnce(verified);
    expect(await processChainEventInbox()).toMatchObject({ dead: 2, processed: 0 });
  });

  it("reverts on rollback without re-verifying against the chain", async () => {
    rpc({ claim_chain_events: [{ ...applyRow, phase: "rollback" }], revert_invoice_payment: "reverted" });
    expect(await processChainEventInbox()).toMatchObject({ processed: 1 });
    expect(service.verifyInvoicePaymentTransaction).not.toHaveBeenCalled();
    expect(db.callRpc).toHaveBeenCalledWith("revert_invoice_payment", { p_inbox_id: 7, p_receipt_onchain_id: "RCP_1", p_tx_id: txId, p_block_hash: "0xB2" });
    expect(db.callRpc).toHaveBeenCalledWith("complete_chain_event", { p_id: 7, p_outcome: "reverted" });
  });
});

describe("Chainhook webhook", () => {
  function delivery(body: unknown, secret = "s".repeat(32)) {
    return new Request("https://stackpay.test/api/webhooks/chainhooks", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  beforeEach(() => {
    vi.stubEnv("STACKPAY_CHAINHOOK_SECRET", "s".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID", contract);
  });

  it("enqueues events durably and acknowledges even if inline processing fails", async () => {
    db.callRpc.mockImplementation(async (fn: string) => {
      if (fn === "enqueue_chain_event") return 1;
      throw new Error("processing unavailable");
    });
    const response = await webhook(delivery({ event: { apply: [block("0xB2", 11, [paidOperation()])], rollback: [] } }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ data: { events: 1, enqueued: 1, duplicates: 0, processing: null } });
  });

  it("reports redeliveries as duplicates", async () => {
    db.callRpc.mockImplementation(async (fn: string) => (fn === "claim_chain_events" ? [] : null));
    const response = await webhook(delivery({ event: { apply: [block("0xB2", 11, [paidOperation()])], rollback: [] } }));
    expect(await response.json()).toMatchObject({ data: { enqueued: 0, duplicates: 1 } });
  });

  it("fails the delivery when events cannot be stored, so Chainhook retries", async () => {
    db.callRpc.mockRejectedValue(new ApiError(503, "database_unreachable", "down"));
    const response = await webhook(delivery({ event: { apply: [block("0xB2", 11, [paidOperation()])], rollback: [] } }));
    expect(response.status).toBe(503);
  });

  it("rejects a wrong secret before touching the database", async () => {
    const response = await webhook(delivery({}, "x".repeat(32)));
    expect(response.status).toBe(401);
    expect(db.callRpc).not.toHaveBeenCalled();
  });
});
