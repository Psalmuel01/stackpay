import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cl, cvToHex, privateKeyToPublic, publicKeyToAddress, signMessageHashRsv } from "@stacks/transactions";
import { walletChallengeMessage } from "../lib/server/wallet-auth";
import { hashMessage } from "@stacks/encryption";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ selectRows: vi.fn(), supabaseRequest: vi.fn() }));
const service = vi.hoisted(() => ({ confirmInvoiceCreation: vi.fn(), confirmSettlementWithdrawal: vi.fn(), getOwnedPaymentLinkIntent: vi.fn(), confirmPaymentLinkChain: vi.fn(), upsertMerchantProfile: vi.fn(), getMerchantProfileByWallet: vi.fn(), }));
vi.mock("../lib/server/supabase-admin", () => ({ ...db, isSupabaseConfigured: () => true }));
vi.mock("../lib/server/stackpay-service", () => service);
import { POST as confirmInvoice } from "../app/api/invoices/confirm/route";
import { POST as confirmSettlement } from "../app/api/settlements/confirm/route";
import { POST as confirmLink } from "../app/api/payment-links/[paymentLinkId]/chain/route";
import { POST as profile, GET as getProfile } from "../app/api/merchant/profile/route";
import { POST as webhook } from "../app/api/webhooks/chainhooks/route";
import { POST as verify } from "../app/api/auth/verify/route";
import { DELETE as logout } from "../app/api/auth/session/route";
import { POST as issue } from "../app/api/auth/challenge/route";
const privateKey = "1".repeat(64) + "01";
const publicKey = privateKeyToPublic(privateKey) as string;
const wallet = publicKeyToAddress(publicKey, "testnet");
const txId = "0x" + "a".repeat(64);
const origin = "https://stackpay.test";
const architecture = `${wallet}.architecture`;
const processor = `${wallet}.processor`;
const cookie = "stackpay-session=" + "a".repeat(64);
const invoice = { walletAddress: wallet, txId, amount: 1, currency: "STX", recipientAddress: wallet, expiresInSeconds: 3600, description: "Invoice" };
function request(path: string, body: unknown, headers = {}) {
  return new Request(origin + path, { method: "POST", headers: { origin, cookie, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function creationTx() { return { tx_id: txId, tx_type: "contract_call", tx_status: "success", sender_address: wallet, canonical: true, microblock_canonical: true, is_unanchored: false, block_height: 100, burn_block_time: 1700000000,
  contract_call: { contract_id: architecture, function_name: "create-invoice", function_args: [Cl.principal(wallet), Cl.uint(1000000), Cl.stringAscii("STX"), Cl.uint(3600), Cl.stringUtf8("Invoice")].map(value => ({ hex: cvToHex(value) })) }, tx_result: { hex: cvToHex(Cl.ok(Cl.stringAscii("INV_1"))), repr: '(ok "INV_1")' } }; }
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("STACKPAY_APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID", architecture); vi.stubEnv("NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", processor);
  db.selectRows.mockResolvedValue([{ wallet_address: wallet }]);
  fetchMock.mockResolvedValue(Response.json(creationTx()));
  service.confirmInvoiceCreation.mockResolvedValue({ id: "invoice" });
});
describe("merchant API boundaries", () => {
  it("denies unauthenticated profile writes before any mutation", async () => {
    const response = await profile(request("/api/merchant/profile", { walletAddress: wallet }, { cookie: "" }));
    expect(response.status).toBe(401); expect(service.upsertMerchantProfile).not.toHaveBeenCalled();
  });
  it("denies reading another merchant", async () => {
    const response = await getProfile(new NextRequest(origin + "/api/merchant/profile?walletAddress=other", { headers: { cookie } }));
    expect(response.status).toBe(403); expect(service.getMerchantProfileByWallet).not.toHaveBeenCalled();
  });
  it("rejects mismatched wallet bodies before mutation", async () => {
    const response = await profile(request("/api/merchant/profile", { walletAddress: "other" }));
    expect(response.status).toBe(403); expect(service.upsertMerchantProfile).not.toHaveBeenCalled();
  });
  it("uses the authenticated wallet for profile writes", async () => {
    expect((await profile(request("/api/merchant/profile", { displayName: "Merchant" }))).status).toBe(201);
    expect(service.upsertMerchantProfile).toHaveBeenCalledWith({ walletAddress: wallet, displayName: "Merchant" });
  });
});
describe("confirmation routes", () => {
  it("persists only an invoice matched to a verified transaction", async () => {
    expect((await confirmInvoice(request("/api/invoices/confirm", invoice))).status).toBe(200);
    expect(service.confirmInvoiceCreation).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: wallet, onchainId: "INV_1", confirmedAt: 1700000000 }));
  });
  it("canonicalizes transaction ids before persistence", async () => {
    expect((await confirmInvoice(request("/api/invoices/confirm", { ...invoice, txId: txId.toUpperCase() }))).status).toBe(200);
    expect(service.confirmInvoiceCreation).toHaveBeenCalledWith(expect.objectContaining({ txId }));
  });
  it("does not persist forged invoice amounts", async () => {
    expect((await confirmInvoice(request("/api/invoices/confirm", { ...invoice, amount: 2 }))).status).toBe(422);
    expect(service.confirmInvoiceCreation).not.toHaveBeenCalled();
  });
  it("does not persist a successful unrelated transaction as a settlement", async () => {
    expect((await confirmSettlement(request("/api/settlements/confirm", { walletAddress: wallet, txId, amount: 1, currency: "STX", destination: wallet }))).status).toBe(422);
    expect(service.confirmSettlementWithdrawal).not.toHaveBeenCalled();
  });
  it("does not persist pending confirmations", async () => {
    fetchMock.mockResolvedValue(Response.json({ tx_status: "pending" }));
    expect((await confirmInvoice(request("/api/invoices/confirm", invoice))).status).toBe(200);
    expect(service.confirmInvoiceCreation).not.toHaveBeenCalled();
  });
  it("does not accept a supplied link id without chain verification", async () => {
    const response = await confirmLink(request("/api/payment-links/id/chain", { onchainLinkId: "LNK_fake" }), { params: Promise.resolve({ paymentLinkId: "id" }) });
    expect(response.status).toBe(400); expect(service.confirmPaymentLinkChain).not.toHaveBeenCalled();
  });
  it("checks link ownership and does not update a pending link", async () => {
    service.getOwnedPaymentLinkIntent.mockResolvedValue({ contractId: architecture, functionName: "create-multipay-link", network: "testnet", arguments: [], sender: wallet });
    fetchMock.mockResolvedValue(Response.json({ tx_status: "pending" }));
    expect((await confirmLink(request("/api/payment-links/id/chain", { txId }), { params: Promise.resolve({ paymentLinkId: "id" }) })).status).toBe(200);
    expect(service.getOwnedPaymentLinkIntent).toHaveBeenCalledWith("id", wallet);
    expect(service.confirmPaymentLinkChain).not.toHaveBeenCalled();
  });
});
describe("authentication lifecycle", () => {

  it.each(["Origin: https://other.test", "Network: mainnet", "Nonce: wrong"])("rejects a valid signature with changed context: %s", async replacement => {
    const original = walletChallengeMessage(request("/api/auth/verify", {}), wallet, "b".repeat(64));
    const field = replacement.split(":")[0];
    const message = original.split("\n").map(line => line.startsWith(field + ":") ? replacement : line).join("\n");
    db.selectRows.mockResolvedValue([{ wallet_address: wallet, message }]);
    const signature = signMessageHashRsv({ privateKey, messageHash: Buffer.from(hashMessage(message)).toString("hex") });
    db.supabaseRequest.mockResolvedValue(true);
    const response = await verify(request("/api/auth/verify", { signature, publicKey }, { cookie: "stackpay-challenge=" + "b".repeat(64) }));
    expect(response.status).toBe(401);
    expect(db.supabaseRequest).not.toHaveBeenCalledWith("rpc/consume_wallet_challenge", expect.anything());
  });
  it.each([null, [], "wallet", 7])("rejects non-object auth bodies", async body => {
    expect((await issue(request("/api/auth/challenge", body))).status).toBe(400);
    expect((await verify(request("/api/auth/verify", body))).status).toBe(400);
    expect(db.supabaseRequest).not.toHaveBeenCalled();
  });
  it("reads the profile from session identity without a wallet query", async () => {
    service.getMerchantProfileByWallet.mockResolvedValue({ company_name: "Merchant" });
    const response = await getProfile(new NextRequest(origin + "/api/merchant/profile", { headers: { cookie } }));
    expect(response.status).toBe(200);
    expect(service.getMerchantProfileByWallet).toHaveBeenCalledWith(wallet);
  });

  it("issues a browser-bound challenge without exposing it in a readable cookie", async () => {
    db.supabaseRequest.mockResolvedValue(true);
    const response = await issue(request("/api/auth/challenge", { walletAddress: wallet }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect((await response.json()).data.message).toContain(`Origin: ${origin}`);
  });
  it("returns a retryable rate limit without setting a challenge cookie", async () => {
    db.supabaseRequest.mockResolvedValue(false);
    const response = await issue(request("/api/auth/challenge", { walletAddress: wallet }));
    expect(response.status).toBe(429); expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("rejects an expired challenge before attempting consumption", async () => {
    db.selectRows.mockResolvedValue([]);
    db.supabaseRequest.mockResolvedValue(true);
    expect((await verify(request("/api/auth/verify", {}, { cookie: "stackpay-challenge=" + "b".repeat(64) }))).status).toBe(401);
    expect(db.supabaseRequest).not.toHaveBeenCalledWith("rpc/consume_wallet_challenge", expect.anything());
  });
  it("creates a session once and refuses a replay that loses atomic consumption", async () => {
    const message = walletChallengeMessage(request("/api/auth/verify", {}), wallet, "b".repeat(64));
    db.selectRows.mockResolvedValue([{ wallet_address: wallet, message }]);
    const signature = signMessageHashRsv({ privateKey, messageHash: Buffer.from(hashMessage(message)).toString("hex") });
    let consumptions = 0;
    db.supabaseRequest.mockImplementation(async (path: string) => path === "rpc/consume_wallet_challenge" ? ++consumptions === 1 : true);
    const headers = { cookie: "stackpay-challenge=" + "b".repeat(64) };
    const accepted = await verify(request("/api/auth/verify", { signature, publicKey }, headers));
    expect(accepted.status).toBe(200); expect(accepted.headers.get("set-cookie")).toContain("stackpay-session=");
    const replayed = await verify(request("/api/auth/verify", { signature, publicKey }, headers));
    expect(replayed.status).toBe(401); expect(replayed.headers.get("set-cookie")).toBeNull();
    expect(db.supabaseRequest).toHaveBeenCalledWith("rpc/consume_wallet_challenge", expect.objectContaining({ body: expect.objectContaining({ p_audience: `${origin}|testnet` }) }));
  });
  it("throttles sign-in attempts per client address", async () => {
    db.supabaseRequest.mockImplementation(async (path: string) => path !== "rpc/take_rate_limit");
    const response = await issue(request("/api/auth/challenge", { walletAddress: wallet }, { "x-forwarded-for": "203.0.113.9" }));
    expect(response.status).toBe(429);
    expect(db.supabaseRequest).toHaveBeenCalledWith("rpc/take_rate_limit", expect.objectContaining({ body: expect.objectContaining({ p_key: "auth-challenge:203.0.113.9" }) }));
    expect(db.supabaseRequest).not.toHaveBeenCalledWith("rpc/issue_wallet_challenge", expect.anything());
  });
  it("only accepts sessions issued for this origin and network", async () => {
    await getProfile(new NextRequest(origin + "/api/merchant/profile", { headers: { cookie } })).catch(() => null);
    expect(db.selectRows).toHaveBeenCalledWith("wallet_sessions", expect.objectContaining({ audience: `eq.${origin}|testnet` }));
  });
  it("signs out everywhere on request", async () => {
    db.supabaseRequest.mockResolvedValue(1);
    const response = await logout(new Request(origin + "/api/auth/session?scope=all", { method: "DELETE", headers: { origin, cookie } }));
    expect(response.status).toBe(200);
    expect(db.supabaseRequest).toHaveBeenCalledWith("rpc/revoke_wallet_sessions", { method: "POST", body: { p_wallet: wallet } });
  });
  it("revokes the server-side session on logout", async () => {
    const response = await logout(new Request(origin + "/api/auth/session", { method: "DELETE", headers: { origin, cookie } }));
    expect(response.status).toBe(200);
    expect(db.supabaseRequest).toHaveBeenCalledWith("wallet_sessions", expect.objectContaining({ method: "DELETE" }));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
describe("webhook secret", () => {
  it.each(["", "configured-secret"])("rejects unauthenticated deliveries when secret is %s", async secret => {
    vi.stubEnv("STACKPAY_CHAINHOOK_SECRET", secret);
    expect((await webhook(request("/api/webhooks/chainhooks", {}))).status).toBe(401);
    expect(db.supabaseRequest).not.toHaveBeenCalled();
  });
});
