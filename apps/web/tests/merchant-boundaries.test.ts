import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { privateKeyToPublic, publicKeyToAddress } from "@stacks/transactions";
const db = vi.hoisted(() => ({ selectRows: vi.fn(), supabaseRequest: vi.fn() }));
const service = vi.hoisted(() => Object.fromEntries([
  "getMerchantProfileByWallet", "upsertMerchantProfile", "getDashboardData", "listInvoicesForWallet", "prepareInvoiceCreation", "confirmInvoiceCreation", "listPaymentLinksForWallet", "createPaymentLinkDraft", "getOwnedPaymentLinkIntent", "confirmPaymentLinkChain", "getUniversalQrForWallet", "createUniversalQrDraft", "listNotificationsForWallet", "markNotificationsReadForWallet", "getSettlementDashboard", "prepareSettlementWithdrawal", "confirmSettlementWithdrawal",
].map(name => [name, vi.fn()])));
vi.mock("../lib/server/supabase-admin", () => ({ ...db, isSupabaseConfigured: () => true }));
vi.mock("../lib/server/stackpay-service", () => service);
import * as profile from "../app/api/merchant/profile/route";
import * as dashboard from "../app/api/dashboard/route";
import * as invoices from "../app/api/invoices/route";
import * as invoiceConfirm from "../app/api/invoices/confirm/route";
import * as links from "../app/api/payment-links/route";
import * as linkConfirm from "../app/api/payment-links/[paymentLinkId]/chain/route";
import * as qr from "../app/api/qr-link/route";
import * as notifications from "../app/api/notifications/route";
import * as settlements from "../app/api/settlements/route";
import * as settlementConfirm from "../app/api/settlements/confirm/route";
const wallet = publicKeyToAddress(privateKeyToPublic("1".repeat(64) + "01") as string, "testnet");
const origin = "https://stackpay.test";
const cookie = "stackpay-session=" + "a".repeat(64);
const mutations = [
  ["profile", "POST", profile.POST], ["invoices", "POST", invoices.POST], ["invoice confirmation", "POST", invoiceConfirm.POST],
  ["links", "POST", links.POST], ["link confirmation", "POST", (r: Request) => linkConfirm.POST(r, { params: { paymentLinkId: "other-link" } })],
  ["QR", "POST", qr.POST], ["notifications", "PATCH", notifications.PATCH], ["settlements", "POST", settlements.POST], ["settlement confirmation", "POST", settlementConfirm.POST],
] as const;
const reads = [
  ["profile", profile.GET, "getMerchantProfileByWallet"], ["dashboard", dashboard.GET, "getDashboardData"], ["invoices", invoices.GET, "listInvoicesForWallet"], ["links", links.GET, "listPaymentLinksForWallet"], ["QR", qr.GET, "getUniversalQrForWallet"], ["notifications", notifications.GET, "listNotificationsForWallet"], ["settlements", settlements.GET, "getSettlementDashboard"],
] as const;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STACKPAY_APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  db.selectRows.mockResolvedValue([{ wallet_address: wallet }]);
  Object.values(service).forEach(fn => fn.mockResolvedValue({}));
});
for (const [name, method, handler] of mutations) {
  it.each(["missing_session", "wrong_wallet", "wrong_origin", "revoked_session"])(`${name} denies %s before business work`, async scenario => {
    if (scenario === "revoked_session") db.selectRows.mockResolvedValue([]);
    const response = await handler(new Request(origin + "/api/test", {
      method, headers: { origin: scenario === "wrong_origin" ? "https://other.test" : origin, cookie: scenario === "missing_session" ? "" : cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: scenario === "wrong_wallet" ? "other" : wallet }),
    }));
    expect(response.status).toBe(scenario === "wrong_wallet" || scenario === "wrong_origin" ? 403 : 401);
    Object.values(service).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
}
for (const [name, handler, serviceName] of reads) {
  it(`${name} reads the session merchant without caller identity`, async () => {
    expect((await handler(new NextRequest(origin + "/api/test", { headers: { cookie } }))).status).toBe(200);
    expect(service[serviceName]).toHaveBeenCalledWith(wallet);
  });
  it(`${name} rejects another merchant query`, async () => {
    expect((await handler(new NextRequest(origin + "/api/test?walletAddress=other", { headers: { cookie } }))).status).toBe(403);
    expect(service[serviceName]).not.toHaveBeenCalled();
  });
}
