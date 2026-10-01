import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cl, cvToHex, privateKeyToPublic, publicKeyToAddress, signMessageHashRsv } from "@stacks/transactions";
import { hashMessage } from "@stacks/encryption";
import { toAtomicAmount } from "../lib/amounts";
import { verifyTransactionPayload } from "../lib/server/transaction-verification";
import { paymentPostConditions } from "../lib/payment-postconditions";
import { requireMerchant, verifyWalletSignature } from "../lib/server/wallet-auth";
const { selectRows } = vi.hoisted(() => ({ selectRows: vi.fn() }));
vi.mock("../lib/server/supabase-admin", () => ({ selectRows, supabaseRequest: vi.fn() }));
const privateKey = "1".repeat(64) + "01";
const publicKey = privateKeyToPublic(privateKey) as string;
const wallet = publicKeyToAddress(publicKey, "testnet");
const txId = "0x" + "a".repeat(64);
const contractId = `${wallet}.processor`;
const expected = { contractId, functionName: "process-stx-payment", network: "testnet", sender: wallet, arguments: [{ type: "string-ascii", value: "invoice-1" }, { type: "uint", value: "1000000" }] };
function transaction() { return {
  tx_id: txId, tx_type: "contract_call", tx_status: "success", sender_address: wallet,
  canonical: true, microblock_canonical: true, is_unanchored: false, block_height: 100, burn_block_time: 1700000000,
  contract_call: { contract_id: contractId, function_name: expected.functionName, function_args: [{ hex: cvToHex(Cl.stringAscii("invoice-1")) }, { hex: cvToHex(Cl.uint(1000000)) }] },
  tx_result: { hex: cvToHex(Cl.ok(Cl.stringAscii("receipt-1"))) },
}; }
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet"); vi.stubEnv("STACKPAY_APP_ORIGIN", "https://stackpay.test"); selectRows.mockReset(); });
describe("transaction evidence", () => {
  it("accepts matching anchored contract calls", () => expect(verifyTransactionPayload(transaction(), txId, expected)).toEqual({ onchainId: "receipt-1", senderAddress: wallet }));
  it.each([
    ["wrong transaction", { tx_id: "0x" + "b".repeat(64) }], ["wrong type", { tx_type: "token_transfer" }],
    ["wrong sender", { sender_address: "ST000000000000000000002AMW42H" }], ["reorg", { canonical: false }],
    ["orphaned microblock", { microblock_canonical: false }], ["unanchored", { is_unanchored: true }],
    ["failed", { tx_status: "abort_by_response" }], ["missing height", { block_height: 0 }],
    ["invalid result", { tx_result: { hex: cvToHex(Cl.error(Cl.uint(1))) } }],
  ])("rejects %s", (_, patch) => expect(() => verifyTransactionPayload({ ...transaction(), ...patch }, txId, expected)).toThrow());
  it.each(["contract", "function", "amount", "invoice", "argument count"])("rejects wrong %s", kind => {
    const payload = transaction();
    if (kind === "contract") payload.contract_call.contract_id = `${wallet}.other`;
    if (kind === "function") payload.contract_call.function_name = "withdraw-stx-to";
    if (kind === "amount") payload.contract_call.function_args[1].hex = cvToHex(Cl.uint(1));
    if (kind === "invoice") payload.contract_call.function_args[0].hex = cvToHex(Cl.stringAscii("other"));
    if (kind === "argument count") payload.contract_call.function_args.pop();
    expect(() => verifyTransactionPayload(payload, txId, expected)).toThrow();
  });
  it("checks withdrawal amount and recipient in the result", () => {
    const intent = { ...expected, functionName: "withdraw-stx-to", arguments: [{ type: "uint", value: "1000000" }, { type: "principal", value: wallet }] };
    const payload = transaction(); payload.contract_call.function_name = intent.functionName;
    payload.contract_call.function_args = [{ hex: cvToHex(Cl.uint(1000000)) }, { hex: cvToHex(Cl.principal(wallet)) }];
    payload.tx_result.hex = cvToHex(Cl.ok(Cl.tuple({ withdrawn: Cl.uint(1000000), recipient: Cl.principal(wallet) })));
    expect(verifyTransactionPayload(payload, txId, intent).onchainId).toBeNull();
    payload.tx_result.hex = cvToHex(Cl.ok(Cl.tuple({ withdrawn: Cl.uint(1), recipient: Cl.principal(wallet) })));
    expect(() => verifyTransactionPayload(payload, txId, intent)).toThrow();
  });
});
describe("wallet identity", () => {
  it("verifies a real signature and rejects a changed message, wallet, and network", () => {
    const message = "StackPay challenge nonce 123";
    const signature = signMessageHashRsv({ privateKey, messageHash: Buffer.from(hashMessage(message)).toString("hex") });
    expect(verifyWalletSignature(message, wallet, publicKey, signature)).toBe(true);
    expect(verifyWalletSignature(message + "tampered", wallet, publicKey, signature)).toBe(false);
    expect(verifyWalletSignature(message, "ST000000000000000000002AMW42H", publicKey, signature)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "mainnet");
    expect(verifyWalletSignature(message, wallet, publicKey, signature)).toBe(false);
  });
  it("rejects unauthenticated access", async () => {
    await expect(requireMerchant(new Request(`https://stackpay.test/api/invoices?walletAddress=${wallet}`))).rejects.toMatchObject({ status: 401 });
  });
  it("rejects another wallet even with a valid session", async () => {
    selectRows.mockResolvedValue([{ wallet_address: wallet }]);
    await expect(requireMerchant(new Request("https://stackpay.test/api/invoices?walletAddress=other", { headers: { cookie: "stackpay-session=" + "a".repeat(64) } }))).rejects.toMatchObject({ status: 403 });
  });
  it("rejects cross-origin mutation before consulting the database", async () => {
    await expect(requireMerchant(new Request("https://stackpay.test/api/invoices", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" }))).rejects.toMatchObject({ status: 403 });
    expect(selectRows).not.toHaveBeenCalled();
  });
  it("accepts bodiless mutations such as send test or rotate, but still rejects malformed bodies", async () => {
    selectRows.mockResolvedValue([{ wallet_address: wallet }]);
    const post = (body?: string) => new Request("https://stackpay.test/api/webhook-endpoints/we_1/test", { method: "POST", headers: { origin: "https://stackpay.test", cookie: "stackpay-session=" + "a".repeat(64), "content-type": "application/json" }, body });
    await expect(requireMerchant(post())).resolves.toBe(wallet);
    await expect(requireMerchant(post(""))).resolves.toBe(wallet);
    await expect(requireMerchant(post("{not json"))).rejects.toBeInstanceOf(SyntaxError);
    await expect(requireMerchant(post(JSON.stringify({ walletAddress: "other" })))).rejects.toMatchObject({ status: 403 });
  });
  it("accepts the session owner and queries only unexpired sessions", async () => {
    selectRows.mockResolvedValue([{ wallet_address: wallet }]);
    await expect(requireMerchant(new Request(`https://stackpay.test/api/invoices?walletAddress=${wallet}`, { headers: { cookie: "stackpay-session=" + "a".repeat(64) } }))).resolves.toBe(wallet);
    expect(selectRows.mock.calls[0][1].expires_at).toMatch(/^gt\./);
  });
});
describe("amounts and transfer limits", () => {
  it("converts exact decimals, small scientific notation, and large string amounts", () => {
    expect(toAtomicAmount(0.29, "STX")).toBe("290000");
    expect(toAtomicAmount(1e-8, "sBTC")).toBe("1");
    expect(toAtomicAmount("9007199254740993.123456", "STX")).toBe("9007199254740993123456");
  });
  it.each([0, -1, NaN, Infinity, 0.0000001, "1.1234567", "1e1000"])("rejects invalid STX amount %s", amount => expect(() => toAtomicAmount(amount, "STX")).toThrow());
  it("limits payment transfers to exact amounts from the payer", () => {
    const pcs = paymentPostConditions(expected, wallet, {});
    expect(pcs).toEqual([{ type: "stx-postcondition", address: wallet, condition: "eq", amount: "1000000" }]);
  });
  it("limits withdrawals from the processor instead of the wallet", () => {
    const pcs = paymentPostConditions({ ...expected, functionName: "withdraw-stx-to", arguments: [{ type: "uint", value: "5" }] }, wallet, {});
    expect(pcs[0]).toMatchObject({ address: contractId, amount: "5", condition: "eq" });
  });
  it("refuses token transfers without a known asset name", () => expect(() => paymentPostConditions({ ...expected, functionName: "process-sip-010-payment", arguments: [...expected.arguments, { type: "principal", value: `${wallet}.token` }] }, wallet, {})).toThrow(/asset name/));
});
