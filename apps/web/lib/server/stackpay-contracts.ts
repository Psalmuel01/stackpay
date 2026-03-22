type Currency = "sBTC" | "STX" | "USDCx";

type ContractArg =
  | { type: "principal"; value: string }
  | { type: "uint"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "string-ascii"; value: string }
  | { type: "string-utf8"; value: string }
  | { type: "optional-string-ascii"; value: string | null }
  | { type: "optional-uint"; value: string | null };

export type ContractIntent = {
  contractId: string;
  contractName: "architecture" | "processor";
  functionName:
    | "create-invoice"
    | "create-multipay-link"
    | "create-universal-qr-link"
    | "create-public-invoice-from-link"
    | "withdraw-stx-to"
    | "withdraw-token-to";
  network: string;
  arguments: ContractArg[];
  notes: string[];
};

function getArchitectureContractId() {
  return process.env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID ?? "ST000000000000000000002AMW42H.architecture";
}

function getProcessorContractId() {
  return process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? "ST000000000000000000002AMW42H.processor";
}

function getNetwork() {
  return process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";
}

function currencyDecimals(currency: Currency) {
  if (currency === "sBTC") {
    return 8;
  }

  return 6;
}

export function toAtomicAmount(amount: number, currency: Currency) {
  const decimals = currencyDecimals(currency);
  return Math.round(amount * 10 ** decimals).toString();
}

export function buildCreateInvoiceIntent(input: {
  recipientAddress: string;
  amount: number;
  currency: Currency;
  expiresInSeconds: number;
  description: string;
}): ContractIntent {
  return {
    contractId: getArchitectureContractId(),
    contractName: "architecture",
    functionName: "create-invoice",
    network: getNetwork(),
    arguments: [
      { type: "principal", value: input.recipientAddress },
      { type: "uint", value: toAtomicAmount(input.amount, input.currency) },
      { type: "string-ascii", value: input.currency },
      { type: "uint", value: String(input.expiresInSeconds) },
      { type: "string-utf8", value: input.description },
    ],
    notes: [
      "Merchant wallet submits this transaction.",
      "Persist the invoice in Supabase only after the chain confirms and returns the on-chain invoice id.",
    ],
  };
}

export function buildCreateMultipayLinkIntent(input: {
  recipientAddress: string;
  slug: string;
  title: string;
  description: string;
  defaultCurrency: Currency;
  defaultAmount: number | null;
  suggestedAmounts: number[];
  amountStep: number | null;
  allowCustomAmount: boolean;
  acceptsStx: boolean;
  acceptsSbtc: boolean;
  acceptsUsdcx: boolean;
}): ContractIntent {
  return {
    contractId: getArchitectureContractId(),
    contractName: "architecture",
    functionName: "create-multipay-link",
    network: getNetwork(),
    arguments: [
      { type: "principal", value: input.recipientAddress },
      { type: "string-ascii", value: input.slug },
      { type: "string-utf8", value: input.title },
      { type: "string-utf8", value: input.description },
      { type: "optional-string-ascii", value: input.defaultCurrency },
      {
        type: "optional-uint",
        value: input.defaultAmount ? toAtomicAmount(input.defaultAmount, input.defaultCurrency) : null,
      },
      {
        type: "optional-uint",
        value: input.suggestedAmounts[0]
          ? toAtomicAmount(input.suggestedAmounts[0], input.defaultCurrency)
          : null,
      },
      {
        type: "optional-uint",
        value: input.suggestedAmounts[1]
          ? toAtomicAmount(input.suggestedAmounts[1], input.defaultCurrency)
          : null,
      },
      {
        type: "optional-uint",
        value: input.suggestedAmounts[2]
          ? toAtomicAmount(input.suggestedAmounts[2], input.defaultCurrency)
          : null,
      },
      {
        type: "optional-uint",
        value: input.amountStep ? toAtomicAmount(input.amountStep, input.defaultCurrency) : null,
      },
      { type: "bool", value: input.allowCustomAmount },
      { type: "bool", value: input.acceptsStx },
      { type: "bool", value: input.acceptsSbtc },
      { type: "bool", value: input.acceptsUsdcx },
    ],
    notes: [
      "Optional string and uint arguments need to be converted to Clarity optionals in the wallet client.",
    ],
  };
}

export function buildCreateUniversalQrIntent(input: {
  recipientAddress: string;
  slug: string;
  title: string;
  description: string;
}): ContractIntent {
  return {
    contractId: getArchitectureContractId(),
    contractName: "architecture",
    functionName: "create-universal-qr-link",
    network: getNetwork(),
    arguments: [
      { type: "principal", value: input.recipientAddress },
      { type: "string-ascii", value: input.slug },
      { type: "string-utf8", value: input.title },
      { type: "string-utf8", value: input.description },
    ],
    notes: ["This replaces the prior active universal QR route on-chain."],
  };
}

export function buildCreatePublicInvoiceFromLinkIntent(input: {
  onchainLinkId: string;
  currency: Currency;
  amount: number;
  expiresInSeconds: number;
  description: string;
}): ContractIntent {
  return {
    contractId: getArchitectureContractId(),
    contractName: "architecture",
    functionName: "create-public-invoice-from-link",
    network: getNetwork(),
    arguments: [
      { type: "string-ascii", value: input.onchainLinkId },
      { type: "string-ascii", value: input.currency },
      { type: "uint", value: toAtomicAmount(input.amount, input.currency) },
      { type: "uint", value: String(input.expiresInSeconds) },
      { type: "string-utf8", value: input.description },
    ],
    notes: ["Customer wallet submits this transaction to generate a fresh invoice from the public payment link."],
  };
}

export function buildWithdrawStxIntent(input: {
  amount: number;
  recipientAddress: string;
}): ContractIntent {
  return {
    contractId: getProcessorContractId(),
    contractName: "processor",
    functionName: "withdraw-stx-to",
    network: getNetwork(),
    arguments: [
      { type: "uint", value: toAtomicAmount(input.amount, "STX") },
      { type: "principal", value: input.recipientAddress },
    ],
    notes: [
      "Merchant wallet submits this transaction.",
      "Processor contract transfers STX balance to the specified settlement destination.",
    ],
  };
}

export function buildWithdrawTokenIntent(input: {
  currency: "sBTC" | "USDCx";
  amount: number;
  tokenContract: string;
  recipientAddress: string;
}): ContractIntent {
  return {
    contractId: getProcessorContractId(),
    contractName: "processor",
    functionName: "withdraw-token-to",
    network: getNetwork(),
    arguments: [
      { type: "string-ascii", value: input.currency },
      { type: "uint", value: toAtomicAmount(input.amount, input.currency) },
      { type: "principal", value: input.tokenContract },
      { type: "principal", value: input.recipientAddress },
    ],
    notes: [
      "Merchant wallet submits this transaction.",
      "Processor contract transfers the selected token balance to the specified settlement destination.",
    ],
  };
}
