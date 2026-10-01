import { beforeEach, describe, expect, it, vi } from "vitest";
import { bufferCV, cvToHex, principalCV, responseOkCV, someCV, trueCV, uintCV } from "@stacks/transactions";
import { privateKeyToPublic, publicKeyToAddress } from "@stacks/transactions";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), upsertRow: vi.fn(), isSupabaseConfigured: () => true }));
const auth = vi.hoisted(() => ({ requireMerchant: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => db);
vi.mock("../lib/server/wallet-auth", () => auth);

import { GET as list, POST as prepare } from "../app/api/invoices/[invoiceId]/refunds/route";
import { POST as confirm } from "../app/api/invoices/[invoiceId]/refunds/confirm/route";
import { memoHex, refundMemo, verifyRefundPayload } from "../lib/server/refund-verification";
import { paymentPostConditions } from "../lib/payment-postconditions";
import { intentValue } from "../lib/contract-values";

const address = (seed: string) => publicKeyToAddress(privateKeyToPublic(seed.repeat(64) + "01") as string, "testnet");
const MERCHANT_WALLET = address("1");
const PAYER = address("2");
const MERCHANT = "11111111-1111-1111-1111-111111111111";
const ID = "inv_" + "a".repeat(24);
const TOKEN = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx";
const txId = "0x" + "e".repeat(64);
const MEMO = refundMemo(ID);

let invoice: Record<string, unknown>;
const params = { params: Promise.resolve({ invoiceId: ID }) };
const post = (path: string, body: unknown) => new Request(`https://stackpay.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function walletBalances(stx: string, usdcx: string) {
  return { stx: { balance: stx }, fungible_tokens: { [`${TOKEN}::usdcx-token`]: { balance: usdcx } } };
}
function anchored(extra: Record<string, unknown>): Record<string, any> {
  return { tx_id: txId, tx_status: "success", sender_address: MERCHANT_WALLET, canonical: true, microblock_canonical: true, is_unanchored: false, block_height: 812, block_hash: "0xbb", burn_block_time: 1_700_000_000, ...extra };
}
function stxTransfer(overrides: Record<string, unknown> = {}) {
  const memo = memoHex(MEMO).padEnd(68, "0");
  return anchored({ tx_type: "token_transfer", token_transfer: { recipient_address: PAYER, amount: "4000000", memo: `0x${memo}`, ...overrides } });
}
function tokenTransfer(args = [uintCV(4_000_000), principalCV(MERCHANT_WALLET), principalCV(PAYER), someCV(bufferCV(Buffer.from(MEMO)))]) {
  return anchored({
    tx_type: "contract_call",
    contract_call: { contract_id: TOKEN, function_name: "transfer", function_args: args.map((cv) => ({ hex: cvToHex(cv) })) },
    tx_result: { hex: cvToHex(responseOkCV(trueCV())) },
  });
}
const stxExpected = { network: "testnet", sender: MERCHANT_WALLET, recipient: PAYER, amountUnits: "4000000", memo: MEMO, tokenContract: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  auth.requireMerchant.mockResolvedValue(MERCHANT_WALLET);
  // The merchant's wallet balances (Hiro /balances), ample unless a test says otherwise.
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(walletBalances("100000000", "1000000000"))));
  invoice = { id: "row-1", public_id: ID, merchant_id: MERCHANT, status: "paid", currency: "USDCx", amount_text: "10.00000000", refunded_text: "3.00000000" };
  db.selectRows.mockImplementation(async (table: string) => {
    if (table === "merchant_profiles") return [{ id: MERCHANT, wallet_address: MERCHANT_WALLET }];
    if (table === "invoices") return [invoice];
    if (table === "receipts") return [{ payer_wallet_address: PAYER, public_id: "rcpt_1" }];
    if (table === "refunds") return [{ public_id: "rfd_1", amount_text: "3.00000000", recipient: PAYER, reason: "", tx_id: txId, block_height: 800, created_at: "2026-10-05T00:00:00Z" }];
    return [];
  });
});

describe("refund verification", () => {
  it("accepts the exact STX transfer, ignoring the node's NUL memo padding", () => {
    expect(verifyRefundPayload(stxTransfer(), txId, stxExpected).senderAddress).toBe(MERCHANT_WALLET);
  });

  it.each([
    ["another recipient", stxTransfer({ recipient_address: MERCHANT_WALLET })],
    ["a different amount", stxTransfer({ amount: "4000001" })],
    ["a different memo", stxTransfer({ memo: `0x${memoHex("SPR:inv_other")}` })],
    ["an unanchored transaction", { ...stxTransfer(), is_unanchored: true }],
    ["a failed transaction", { ...stxTransfer(), tx_status: "abort_by_post_condition" }],
    ["a transfer sent by someone else", { ...stxTransfer(), sender_address: PAYER }],
  ])("rejects %s", (_label, payload) => {
    expect(() => verifyRefundPayload(payload, txId, stxExpected)).toThrow(/does not match/);
  });

  it("verifies SIP-010 transfers argument by argument", () => {
    const expected = { ...stxExpected, tokenContract: TOKEN };
    expect(() => verifyRefundPayload(tokenTransfer(), txId, expected)).not.toThrow();
    expect(() => verifyRefundPayload(tokenTransfer([uintCV(4_000_000), principalCV(MERCHANT_WALLET), principalCV(MERCHANT_WALLET), someCV(bufferCV(Buffer.from(MEMO)))]), txId, expected)).toThrow();
    expect(() => verifyRefundPayload({ ...tokenTransfer(), contract_call: { ...tokenTransfer().contract_call, contract_id: `${MERCHANT_WALLET}.fake-usdcx` } }, txId, expected)).toThrow();
  });
});

describe("refund transaction building", () => {
  it("encodes the memo as an optional buffer and caps the transfer with a post-condition", () => {
    const intent = { contractId: TOKEN, functionName: "transfer", arguments: [{ type: "uint", value: "4000000" }, { type: "principal", value: MERCHANT_WALLET }, { type: "principal", value: PAYER }, { type: "optional-buffer", value: memoHex(MEMO) }] };
    expect(cvToHex(intentValue(intent.arguments[3]))).toBe(cvToHex(someCV(bufferCV(Buffer.from(MEMO)))));
    expect(paymentPostConditions(intent, MERCHANT_WALLET, { [TOKEN]: "usdcx-token" })).toEqual([
      { type: "ft-postcondition", address: MERCHANT_WALLET, condition: "eq", amount: "4000000", asset: `${TOKEN}::usdcx-token` },
    ]);
    expect(() => paymentPostConditions({ ...intent, arguments: [intent.arguments[0], { type: "principal", value: PAYER }, ...intent.arguments.slice(2)] }, MERCHANT_WALLET, { [TOKEN]: "usdcx-token" })).toThrow(/connected wallet/);
  });
});

describe("refund routes", () => {
  it("prepares a transfer back to the original payer for at most the remaining amount", async () => {
    const response = await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "7" }), params);
    const { data } = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ amount: "7", currency: "USDCx", recipient: PAYER, remaining: "7" });
    expect(data.transfer.intent.arguments.map((a: { value: string }) => a.value)).toEqual(["7000000", MERCHANT_WALLET, PAYER, memoHex(MEMO)]);

    const tooMuch = await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "7.000001" }), params);
    expect(tooMuch.status).toBe(409);
    expect((await tooMuch.json()).error.code).toBe("refund_exceeds_remaining");
  });

  it("refuses a refund to the merchant's own wallet, which Stacks cannot broadcast", async () => {
    db.selectRows.mockImplementation(async (table: string) => {
      if (table === "merchant_profiles") return [{ id: MERCHANT, wallet_address: MERCHANT_WALLET }];
      if (table === "invoices") return [invoice];
      if (table === "receipts") return [{ payer_wallet_address: MERCHANT_WALLET, public_id: "rcpt_1" }];
      return [];
    });
    const response = await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "1" }), params);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("refund_to_self");
  });

  it("explains an underfunded wallet before asking it to sign", async () => {
    vi.stubEnv("NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME", "usdcx-token");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(walletBalances("100000000", "2000000"))));
    const response = await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "7" }), params);
    expect(response.status).toBe(409);
    const { error } = await response.json();
    expect(error.code).toBe("insufficient_wallet_balance");
    expect(error.message).toMatch(/holds 2 USDCx.*withdraw from Settlements/);
  });

  it("keeps STX headroom for the network fee", async () => {
    invoice = { ...invoice, currency: "STX", amount_text: "10.000000", refunded_text: "0" };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(walletBalances("2500000", "0"))));
    expect((await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "2.5" }), params)).status).toBe(409);
  });

  it("does not block the refund when balances cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "1" }), params)).status).toBe(200);
  });

  it("uses a native STX transfer for STX invoices", async () => {
    invoice = { ...invoice, currency: "STX", amount_text: "10.000000", refunded_text: "0" };
    const { data } = await (await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "2.5" }), params)).json();
    expect(data.transfer).toEqual({ kind: "stx", recipient: PAYER, amountMicroStx: "2500000", memo: MEMO, network: "testnet" });
  });

  it("refuses unpaid invoices and invoices of other merchants", async () => {
    invoice = { ...invoice, status: "pending" };
    expect((await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "1" }), params)).status).toBe(409);
    db.selectRows.mockImplementation(async (table: string) => (table === "merchant_profiles" ? [{ id: MERCHANT, wallet_address: MERCHANT_WALLET }] : []));
    expect((await prepare(post(`/api/invoices/${ID}/refunds`, { amount: "1" }), params)).status).toBe(404);
    expect(db.selectRows).toHaveBeenCalledWith("invoices", expect.objectContaining({ merchant_id: `eq.${MERCHANT}` }));
  });

  it("reports pending until the transfer is anchored, then records it once verified", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = await confirm(post(`/api/invoices/${ID}/refunds/confirm`, { txId, amount: "4" }), params);
    expect(pending.status).toBe(202);
    expect(db.callRpc).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(Response.json(tokenTransfer()));
    db.callRpc.mockResolvedValue({ outcome: "recorded", refund: { public_id: "rfd_2", amount: 4, recipient: PAYER, reason: "Damaged", tx_id: txId, block_height: 812, created_at: "2026-10-05T00:00:00Z" } });
    const response = await confirm(post(`/api/invoices/${ID}/refunds/confirm`, { txId, amount: "4", reason: "Damaged" }), params);
    const { data } = await response.json();
    expect(response.status).toBe(200);
    expect(data.refund).toMatchObject({ id: "rfd_2", amount: "4", amount_units: "4000000", recipient: PAYER });
    expect(db.callRpc).toHaveBeenCalledWith("record_refund", expect.objectContaining({ p_invoice_id: "row-1", p_amount: "4", p_recipient: PAYER, p_block_height: 812 }));
  });

  it("does not record a transfer that fails verification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(tokenTransfer([uintCV(1), principalCV(MERCHANT_WALLET), principalCV(PAYER), someCV(bufferCV(Buffer.from(MEMO)))]))));
    const response = await confirm(post(`/api/invoices/${ID}/refunds/confirm`, { txId, amount: "4" }), params);
    expect(response.status).toBe(422);
    expect(db.callRpc).not.toHaveBeenCalled();
  });

  it("lists recorded refunds", async () => {
    const { data } = await (await list(new Request(`https://stackpay.test/api/invoices/${ID}/refunds`), params)).json();
    expect(data.refunds).toEqual([expect.objectContaining({ id: "rfd_1", amount: "3", currency: "USDCx" })]);
  });
});
