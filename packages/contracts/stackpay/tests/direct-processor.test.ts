import { Cl, cvToValue } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

// Prototype for docs/adr/0001-settlement-model.md: payments settle directly to the invoice recipient.
const accounts = simnet.getAccounts();
const deployer = simnet.deployer;
const merchant = accounts.get("wallet_1")!;
const payer = accounts.get("wallet_2")!;
const recipient = accounts.get("wallet_3")!;
const direct = `${deployer}.direct`;

function stxBalance(who: string) {
  return simnet.getAssetsMap().get("STX")?.get(who) ?? 0n;
}
function createInvoice(amount: number, currency = "STX", expiresIn = 3600) {
  const created = simnet.callPublicFn("arch", "create-invoice", [
    Cl.principal(recipient), Cl.uint(amount), Cl.stringAscii(currency), Cl.uint(expiresIn), Cl.stringUtf8("Direct settlement"),
  ], merchant);
  return cvToValue(created.result.value) as string;
}

describe("direct settlement prototype", () => {
  beforeEach(() => {
    expect(simnet.callPublicFn("arch", "set-processor", [Cl.principal(direct)], deployer).result).toBeOk(Cl.bool(true));
  });

  it("moves STX straight to the recipient and never holds funds", () => {
    const invoiceId = createInvoice(1000);
    const [payerBefore, recipientBefore] = [stxBalance(payer), stxBalance(recipient)];
    const paid = simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(invoiceId), Cl.uint(1000)], payer);
    expect(paid.result.type).toBe("ok");
    expect(stxBalance(recipient) - recipientBefore).toBe(1000n);
    expect(payerBefore - stxBalance(payer)).toBe(1000n);
    expect(stxBalance(direct)).toBe(0n);
    const view = simnet.callReadOnlyFn("arch", "get-invoice", [Cl.stringAscii(invoiceId)], merchant);
    expect((cvToValue(view.result, true) as any).value.value.status.value).toBe("1");
    const events = paid.events.map((e: any) => e.event);
    expect(events).toContain("stx_transfer_event");
  });

  it("rejects the wrong amount, a second payment, and an expired invoice without moving money", () => {
    const invoiceId = createInvoice(500);
    const before = stxBalance(recipient);
    expect(simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(invoiceId), Cl.uint(499)], payer).result).toBeErr(Cl.uint(405));
    expect(simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(invoiceId), Cl.uint(500)], payer).result.type).toBe("ok");
    expect(simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(invoiceId), Cl.uint(500)], payer).result.type).toBe("err");
    expect(stxBalance(recipient) - before).toBe(500n);

    const expiring = createInvoice(100, "STX", 1);
    simnet.mineEmptyBlocks(5);
    const recipientBefore = stxBalance(recipient);
    expect(simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(expiring), Cl.uint(100)], payer).result.type).toBe("err");
    expect(stxBalance(recipient)).toBe(recipientBefore);
  });

  it("rolls back the payment state when the transfer fails", () => {
    const tooLarge = createInvoice(10 ** 15);
    const result = simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(tooLarge), Cl.uint(10 ** 15)], payer);
    expect(result.result.type).toBe("err");
    const view = simnet.callReadOnlyFn("arch", "get-invoice", [Cl.stringAscii(tooLarge)], merchant);
    expect((cvToValue(view.result, true) as any).value.value.status.value).toBe("0");
  });

  it("settles SIP-010 tokens directly and rejects the wrong token", () => {
    const token = { address: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1", name: "sbtc-token" };
    simnet.deployContract(token.name, `
      (define-fungible-token sbtc-token)
      (define-public (mint (amount uint) (recipient principal)) (ft-mint? sbtc-token amount recipient))
      (define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
        (begin (asserts! (is-eq tx-sender sender) (err u4)) (ft-transfer? sbtc-token amount sender recipient)))
      (define-read-only (get-balance (who principal)) (ok (ft-get-balance sbtc-token who)))`, { clarityVersion: 4 }, token.address);
    const principal = `${token.address}.${token.name}`;
    simnet.callPublicFn(principal, "mint", [Cl.uint(5000), Cl.principal(payer)], token.address);
    const invoiceId = createInvoice(2500, "sBTC");
    const wrong = simnet.callPublicFn("direct", "process-sip-010-payment", [Cl.stringAscii(invoiceId), Cl.uint(2500), Cl.principal(`${deployer}.arch`)], payer);
    expect(wrong.result.type).toBe("err");
    const paid = simnet.callPublicFn("direct", "process-sip-010-payment", [Cl.stringAscii(invoiceId), Cl.uint(2500), Cl.principal(principal)], payer);
    expect(paid.result.type).toBe("ok");
    expect(simnet.callReadOnlyFn(principal, "get-balance", [Cl.principal(recipient)], payer).result).toBeOk(Cl.uint(2500));
    expect(simnet.callReadOnlyFn(principal, "get-balance", [Cl.principal(direct)], payer).result).toBeOk(Cl.uint(0));
  });

  it("cannot mark invoices paid unless the owner authorized it", () => {
    expect(simnet.callPublicFn("arch", "set-processor", [Cl.principal(`${deployer}.proc`)], deployer).result).toBeOk(Cl.bool(true));
    const invoiceId = createInvoice(10);
    expect(simnet.callPublicFn("direct", "process-stx-payment", [Cl.stringAscii(invoiceId), Cl.uint(10)], payer).result).toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn("arch", "set-processor", [Cl.principal(direct)], payer).result.type).toBe("err");
  });
});
