import { normalizeTransactionId } from "../transaction-id";
import { ApiError } from "./api-error";
import { verifyTransactionPayload, type ExpectedTransaction } from "./transaction-verification";
import { stacksNetworks } from "@stackpay/config";
import { cvToHex, cvToValue, hexToCV, principalCV, stringAsciiCV } from "@stacks/transactions";
import { atomicToDecimal, parseAtomicUnits, type PaymentCurrency } from "../amounts";

// Upstream chain calls must never hang a request indefinitely.
const CHAIN_TIMEOUT_MS = 10_000;
const chainSignal = () => AbortSignal.timeout(CHAIN_TIMEOUT_MS);

function getStacksApiUrl() {
  const network = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";
  return process.env.STACKPAY_STACKS_API_URL ?? stacksNetworks[network]?.apiUrl ?? stacksNetworks.testnet.apiUrl;
}

function getProcessorContractId() {
  return process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? "";
}

export const tokenContracts = {
  sBTC:
    process.env.NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID ??
    "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
  USDCx:
    process.env.NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID ??
    "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
} as const;

/** Exact decimal strings; null means the balance could not be read, never zero. */
export type WalletBalances = {
  STX: string | null;
  sBTC: string | null;
  USDCx: string | null;
};

/** Exact decimal strings of the merchant's withdrawable processor balance. */
export type ProcessorBalances = {
  STX: string;
  sBTC: string;
  USDCx: string;
};

export type TxSyncResult =
  | {
      status: "pending";
    }
  | {
      status: "success";
      resultRepr: string | null;
      onchainId: string | null;
      senderAddress: string;
      txId: string;
      confirmedAt: number | null;
    }
  | {
      status: "abort_by_response" | "abort_by_post_condition" | "failed";
      resultRepr: string | null;
      reason: string | null;
      confirmedAt: number | null;
    };

function parseContractId(contractId: string) {
  const [contractAddress, contractName] = contractId.split(".");
  if (!contractAddress || !contractName) {
    throw new Error(`Invalid contract id: ${contractId}`);
  }

  return { contractAddress, contractName };
}

function atomicToAmount(value: string | number | bigint | null | undefined, currency: PaymentCurrency) {
  const units = parseAtomicUnits(value ?? "0");
  return units === null ? null : atomicToDecimal(units, currency);
}

function unwrapCvScalar(value: any): string | number | bigint | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }

  if (typeof value === "object" && "value" in value) {
    return unwrapCvScalar(value.value);
  }

  return null;
}

function extractBalanceAmount(value: any): string | number | bigint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("amount" in value) {
    return unwrapCvScalar(value.amount);
  }

  if ("value" in value && value.value && typeof value.value === "object" && "amount" in value.value) {
    return unwrapCvScalar(value.value.amount);
  }

  return null;
}

function findTokenBalance(
  fungibleTokens: Record<string, { balance?: string | number }>,
  contractId: string,
  assetName: string,
  currency: PaymentCurrency
) {
  const key = `${contractId}::${assetName}`;
  if (!Object.prototype.hasOwnProperty.call(fungibleTokens, key)) {
    return "0";
  }

  return atomicToAmount(fungibleTokens[key]?.balance, currency);
}

export async function getWalletBalances(address: string): Promise<WalletBalances> {
  const response = await fetch(`${getStacksApiUrl()}/extended/v1/address/${address}/balances`, {
    cache: "no-store",
    signal: chainSignal(),
  });

  if (!response.ok) {
    throw new ApiError(503, "chain_unavailable", "Wallet balances are temporarily unavailable.");
  }

  const payload = await response.json();
  const fungibleTokens = (payload.fungible_tokens ?? {}) as Record<string, { balance?: string | number }>;

  return {
    STX: atomicToAmount(payload.stx?.balance, "STX"),
    sBTC: findTokenBalance(fungibleTokens, tokenContracts.sBTC, process.env.NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME ?? "sbtc-token", "sBTC"),
    USDCx: findTokenBalance(fungibleTokens, tokenContracts.USDCx, process.env.NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME ?? "usdcx-token", "USDCx"),
  };
}

async function callProcessorReadOnly(functionName: string, args: string[]) {
  const contractId = getProcessorContractId();
  if (!contractId) {
    throw new Error("NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID is not configured.");
  }

  const { contractAddress, contractName } = parseContractId(contractId);
  const response = await fetch(
    `${getStacksApiUrl()}/v2/contracts/call-read/${contractAddress}/${contractName}/${functionName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: chainSignal(),
      body: JSON.stringify({
        sender: contractAddress,
        arguments: args,
      }),
    }
  );

  if (!response.ok) {
    throw new ApiError(503, "chain_unavailable", `The Stacks API could not run ${functionName}. Try again shortly.`);
  }

  return response.json();
}

export async function getProcessorBalances(address: string): Promise<ProcessorBalances> {
  const currencies = ["STX", "sBTC", "USDCx"] as const;
  const results = await Promise.all(
    currencies.map(async (currency) => {
      const payload = await callProcessorReadOnly("get-balance", [
        cvToHex(principalCV(address)),
        cvToHex(stringAsciiCV(currency)),
      ]);

      // A failed or unreadable call is "unavailable", never a zero balance.
      if (!payload.okay) {
        throw new ApiError(503, "chain_unavailable", "Processor balances are temporarily unavailable. Try again shortly.");
      }

      const value = cvToValue(hexToCV(payload.result));
      const amount = atomicToAmount(extractBalanceAmount(value), currency);
      if (amount === null) {
        throw new ApiError(503, "chain_unavailable", "Processor balances could not be read. Try again shortly.");
      }

      return [currency, amount] as const;
    })
  );

  return Object.fromEntries(results) as ProcessorBalances;
}

export async function syncTransaction(txId: string, expected: ExpectedTransaction): Promise<TxSyncResult> {
  const normalizedTxId = normalizeTransactionId(txId);
  if (!normalizedTxId) throw new ApiError(400, "invalid_tx_id", "A valid transaction id is required.");
  txId = normalizedTxId;
  const response = await fetch(`${getStacksApiUrl()}/extended/v1/tx/${txId}`, {
    cache: "no-store",
    signal: chainSignal(),
  });

  if (response.status === 404) return { status: "pending" };
  if (!response.ok) {
    throw new Error(`Failed to fetch transaction ${txId} from Stacks API.`);
  }

  const payload = await response.json();
  const status = payload.tx_status as string | undefined;
  const resultRepr = payload.tx_result?.repr ?? null;
  const confirmedAt = typeof payload.burn_block_time === "number" ? payload.burn_block_time : null;

  if (!status || status === "pending" || (status === "success" && payload.is_unanchored === true)) {
    return { status: "pending" };
  }

  if (status === "success") {
    return {
      status: "success",
      resultRepr,
      ...verifyTransactionPayload(payload, txId, expected),
      txId,
      confirmedAt,
    };
  }

  if (status === "abort_by_response" || status === "abort_by_post_condition") {
    return {
      status,
      resultRepr,
      reason: payload.tx_result?.repr ?? null,
      confirmedAt,
    };
  }

  return {
    status: "failed",
    resultRepr,
    reason: payload.tx_status ?? null,
    confirmedAt,
  };
}

export async function syncInvoiceCreationTx(txId: string, expected: ExpectedTransaction): Promise<TxSyncResult> {
  return syncTransaction(txId, expected);
}
