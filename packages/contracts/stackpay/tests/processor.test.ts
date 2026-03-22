import { tx } from "@stacks/clarinet-sdk";
import { Cl, cvToValue, stringAsciiCV, stringUtf8CV, uintCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = simnet.deployer;
const merchant = accounts.get("wallet_1")!;
const payer = accounts.get("wallet_2")!;
const recipient = accounts.get("wallet_3")!;
const processorPrincipal = `${deployer}.processor`;

function getCurrentTime(sender: string) {
  const now = simnet.callReadOnlyFn("architecture", "get-current-time", [], sender);
  expect(now.result).toBeOk(Cl.uint(cvToValue(now.result.value) as bigint));
  return cvToValue(now.result.value) as bigint;
}

describe("processor", () => {
  it("processes STX payments and marks invoices paid", () => {
    const setup = simnet.mineBlock([
      tx.callPublicFn("architecture", "set-processor", [Cl.principal(processorPrincipal)], deployer),
      tx.callPublicFn(
        "architecture",
        "create-invoice",
        [
          Cl.principal(recipient),
          uintCV(1000),
          stringAsciiCV("STX"),
          uintCV(3600),
          stringUtf8CV("Consulting invoice"),
        ],
        merchant
      ),
    ]);

    expect(setup[0].result).toBeOk(Cl.bool(true));
    const invoiceId = cvToValue(setup[1].result.value) as string;
    const createdAt = getCurrentTime(merchant);

    const payment = simnet.callPublicFn(
      "processor",
      "process-stx-payment",
      [stringAsciiCV(invoiceId), uintCV(1000)],
      payer
    );
    const receiptId = cvToValue(payment.result.value) as string;
    expect(payment.result).toBeOk(Cl.stringAscii(receiptId));

    const paidAt = getCurrentTime(merchant);
    const invoice = simnet.callReadOnlyFn(
      "architecture",
      "get-invoice",
      [stringAsciiCV(invoiceId)],
      merchant
    );

    expect(invoice.result).toBeOk(
      Cl.some(
        Cl.tuple({
          merchant: Cl.principal(merchant),
          recipient: Cl.principal(recipient),
          amount: Cl.uint(1000),
          currency: Cl.stringAscii("STX"),
          status: Cl.uint(1),
          "created-at": Cl.uint(createdAt),
          "expires-at": Cl.uint(createdAt + 3600n),
          "paid-at": Cl.some(Cl.uint(paidAt)),
          description: Cl.stringUtf8("Consulting invoice"),
        })
      )
    );

    const balance = simnet.callReadOnlyFn(
      "processor",
      "get-balance",
      [Cl.principal(merchant), stringAsciiCV("STX")],
      merchant
    );
    expect(balance.result).toBeSome(Cl.tuple({ amount: Cl.uint(1000) }));
  });

  it("withdraws the full merchant STX balance to a chosen settlement wallet", () => {
    const setup = simnet.mineBlock([
      tx.callPublicFn("architecture", "set-processor", [Cl.principal(processorPrincipal)], deployer),
      tx.callPublicFn(
        "architecture",
        "create-invoice",
        [
          Cl.principal(recipient),
          uintCV(1000),
          stringAsciiCV("STX"),
          uintCV(3600),
          stringUtf8CV("Withdrawal invoice"),
        ],
        merchant
      ),
    ]);

    const invoiceId = cvToValue(setup[1].result.value) as string;

    simnet.mineBlock([
      tx.callPublicFn(
        "processor",
        "process-stx-payment",
        [stringAsciiCV(invoiceId), uintCV(1000)],
        payer
      ),
    ]);

    const withdrawn = simnet.callPublicFn(
      "processor",
      "withdraw-stx-to",
      [uintCV(1000), Cl.principal(recipient)],
      merchant
    );
    expect(withdrawn.result).toBeOk(
      Cl.tuple({
        withdrawn: Cl.uint(1000),
        recipient: Cl.principal(recipient),
      })
    );

    const balance = simnet.callReadOnlyFn(
      "processor",
      "get-balance",
      [Cl.principal(merchant), stringAsciiCV("STX")],
      merchant
    );
    expect(balance.result).toBeSome(Cl.tuple({ amount: Cl.uint(0) }));
  });
});
