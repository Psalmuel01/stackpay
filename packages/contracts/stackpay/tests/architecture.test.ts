import { tx } from "@stacks/clarinet-sdk";
import { Cl, cvToValue, noneCV, stringAsciiCV, stringUtf8CV, uintCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const merchant = accounts.get("wallet_1")!;
const recipient = accounts.get("wallet_2")!;
const customer = accounts.get("wallet_3")!;

function unwrapSomeOk(result: any) {
  expect(result.result).toBeOk(Cl.some(result.result.value.value));
  return cvToValue(result.result.value.value) as Record<string, any>;
}

describe("arch", () => {
  it("creates standard invoices directly", () => {
    const created = simnet.callPublicFn(
      "arch",
      "create-invoice",
      [
        Cl.principal(recipient),
        uintCV(1200),
        stringAsciiCV("STX"),
        uintCV(3600),
        stringUtf8CV("Starter plan"),
      ],
      merchant
    );

    const invoiceId = cvToValue(created.result.value) as string;
    expect(created.result).toBeOk(Cl.stringAscii(invoiceId));

    const invoiceView = unwrapSomeOk(
      simnet.callReadOnlyFn("arch", "get-invoice-view", [stringAsciiCV(invoiceId)], merchant)
    );
    expect(invoiceView.merchant.value).toBe(merchant);
    expect(invoiceView.recipient.value).toBe(recipient);
    expect(invoiceView.amount.value).toBe("1200");
    expect(invoiceView.currency.value).toBe("STX");
    expect(invoiceView.status.value).toBe("0");
    expect(invoiceView.description.value).toBe("Starter plan");
  });

  it("creates public invoices from multipay links", () => {
    const linkCreated = simnet.callPublicFn(
      "arch",
      "create-multipay-link",
      [
        Cl.principal(recipient),
        stringAsciiCV("merchant-pay"),
        stringUtf8CV("Merchant Pay"),
        stringUtf8CV("Book purchase"),
        Cl.some(Cl.stringAscii("STX")),
        Cl.some(Cl.uint(1000)),
        noneCV(),
        noneCV(),
        noneCV(),
        noneCV(),
        Cl.bool(false),
        Cl.bool(true),
        Cl.bool(false),
        Cl.bool(false),
      ],
      merchant
    );

    const linkId = cvToValue(linkCreated.result.value) as string;
    expect(linkCreated.result).toBeOk(Cl.stringAscii(linkId));

    const invoiceCreated = simnet.callPublicFn(
      "arch",
      "create-public-invoice-from-link",
      [
        stringAsciiCV(linkId),
        stringAsciiCV("STX"),
        uintCV(1000),
        uintCV(7200),
        stringUtf8CV("Different description"),
      ],
      customer
    );

    const invoiceId = cvToValue(invoiceCreated.result.value) as string;
    expect(invoiceCreated.result).toBeOk(Cl.stringAscii(invoiceId));

    const invoice = unwrapSomeOk(
      simnet.callReadOnlyFn("arch", "get-invoice", [stringAsciiCV(invoiceId)], merchant)
    );
    expect(invoice.merchant.value).toBe(merchant);
    expect(invoice.recipient.value).toBe(recipient);
    expect(invoice.amount.value).toBe("1000");
    expect(invoice.currency.value).toBe("STX");
    expect(invoice.status.value).toBe("0");
    expect(invoice.description.value).toBe("Merchant Pay");
  });

  it("creates public invoices from multipay suggested amounts", () => {
    const linkCreated = simnet.callPublicFn(
      "arch",
      "create-multipay-link",
      [
        Cl.principal(recipient),
        stringAsciiCV("merchant-book"),
        stringUtf8CV("Merchant Book"),
        stringUtf8CV("Digital book"),
        Cl.some(Cl.stringAscii("STX")),
        Cl.some(Cl.uint(500)),
        Cl.some(Cl.uint(500)),
        Cl.some(Cl.uint(900)),
        noneCV(),
        noneCV(),
        Cl.bool(false),
        Cl.bool(true),
        Cl.bool(false),
        Cl.bool(false),
      ],
      merchant
    );

    const linkId = cvToValue(linkCreated.result.value) as string;
    expect(linkCreated.result).toBeOk(Cl.stringAscii(linkId));

    const invoiceCreated = simnet.callPublicFn(
      "arch",
      "create-public-invoice-from-link",
      [
        stringAsciiCV(linkId),
        stringAsciiCV("STX"),
        uintCV(900),
        uintCV(7200),
        stringUtf8CV("Ignored"),
      ],
      customer
    );

    const invoiceId = cvToValue(invoiceCreated.result.value) as string;
    expect(invoiceCreated.result).toBeOk(Cl.stringAscii(invoiceId));

    const invoice = unwrapSomeOk(
      simnet.callReadOnlyFn("arch", "get-invoice", [stringAsciiCV(invoiceId)], merchant)
    );
    expect(invoice.amount.value).toBe("900");
    expect(invoice.description.value).toBe("Merchant Book");
  });

  it("marks invoice views expired when time has elapsed", () => {
    const created = simnet.callPublicFn(
      "arch",
      "create-invoice",
      [
        Cl.principal(recipient),
        uintCV(400),
        stringAsciiCV("USDCx"),
        uintCV(1),
        stringUtf8CV("Flash sale"),
      ],
      merchant
    );

    const invoiceId = cvToValue(created.result.value) as string;
    simnet.mineEmptyBlocks(1);

    const invoiceView = unwrapSomeOk(
      simnet.callReadOnlyFn("arch", "get-invoice-view", [stringAsciiCV(invoiceId)], merchant)
    );
    expect(invoiceView.status.value).toBe("2");
    expect(invoiceView.description.value).toBe("Flash sale");
  });
});
