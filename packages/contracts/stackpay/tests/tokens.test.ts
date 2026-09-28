import { Cl, cvToValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const merchant = simnet.getAccounts().get("wallet_1")!;
const payer = simnet.getAccounts().get("wallet_2")!;
const recipient = simnet.getAccounts().get("wallet_3")!;
const tokens = [
  { currency: "sBTC", address: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1", name: "sbtc-token", asset: "sbtc-token" },
  { currency: "USDCx", address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", name: "usdcx", asset: "usdcx-token" },
];

// Interface fixtures only: these exercise StackPay wiring and accounting, not
// the bridge or the production token's mint authority/registry dependencies.
function tokenSource(asset: string) {
  return `
    (define-fungible-token ${asset})
    (define-public (mint (amount uint) (recipient principal)) (ft-mint? ${asset} amount recipient))
    (define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
      (begin (asserts! (is-eq tx-sender sender) (err u4)) (ft-transfer? ${asset} amount sender recipient)))
    (define-read-only (get-balance (who principal)) (ok (ft-get-balance ${asset} who)))`;
}

describe("reset testnet token wiring", () => {
  for (const token of tokens) {
    it(`accepts ${token.currency}, prevents replay and withdraws the recorded balance`, () => {
      const principal = `${token.address}.${token.name}`;
      simnet.deployContract(token.name, tokenSource(token.asset), { clarityVersion: 4 }, token.address);
      expect(simnet.callPublicFn(principal, "mint", [Cl.uint(2000), Cl.principal(payer)], token.address).result).toBeOk(Cl.bool(true));
      const creation = simnet.callPublicFn("arch", "create-invoice", [
        Cl.principal(merchant), Cl.uint(1000), Cl.stringAscii(token.currency), Cl.uint(3600), Cl.stringUtf8("Token wiring test"),
      ], merchant);
      const invoiceId = cvToValue(creation.result.value) as string;
      const args = [Cl.stringAscii(invoiceId), Cl.uint(1000), Cl.principal(principal)];
      const paid = simnet.callPublicFn("proc", "process-sip-010-payment", args, payer);
      expect(paid.result.type).toBe("ok");
      const repeated = simnet.callPublicFn("proc", "process-sip-010-payment", args, payer);
      expect(repeated.result.type).toBe("err");
      expect(simnet.callReadOnlyFn(principal, "get-balance", [Cl.principal(payer)], payer).result).toBeOk(Cl.uint(1000));
      expect(simnet.callPublicFn("proc", "withdraw-token-to", [
        Cl.stringAscii(token.currency), Cl.uint(1000), Cl.principal(principal), Cl.principal(recipient),
      ], merchant).result).toBeOk(Cl.tuple({ withdrawn: Cl.uint(1000), recipient: Cl.principal(recipient) }));
      expect(simnet.callReadOnlyFn(principal, "get-balance", [Cl.principal(recipient)], merchant).result).toBeOk(Cl.uint(1000));
      expect(simnet.callReadOnlyFn("proc", "get-balance", [Cl.principal(merchant), Cl.stringAscii(token.currency)], merchant).result)
        .toBeSome(Cl.tuple({ amount: Cl.uint(0) }));
    });
  }
  it("rejects the retired sBTC principal", () => {
    const old = "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT";
    simnet.deployContract("sbtc-token", tokenSource("sbtc-token"), { clarityVersion: 4 }, old);
    const creation = simnet.callPublicFn("arch", "create-invoice", [Cl.principal(merchant), Cl.uint(1), Cl.stringAscii("sBTC"), Cl.uint(3600), Cl.stringUtf8("Retired token")], merchant);
    const id = cvToValue(creation.result.value) as string;
    expect(simnet.callPublicFn("proc", "process-sip-010-payment", [Cl.stringAscii(id), Cl.uint(1), Cl.principal(`${old}.sbtc-token`)], payer).result).toBeErr(Cl.uint(401));
  });
});
