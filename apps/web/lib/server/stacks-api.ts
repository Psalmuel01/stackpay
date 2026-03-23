import { stacksNetworks } from "@stackpay/config";
import { cvToHex, cvToValue, hexToCV, principalCV, stringAsciiCV } from "@stacks/transactions";

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
    "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token",
  USDCx:
    process.env.NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID ??
    "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
} as const;

export type WalletBalances = {
  STX: number | null;
  sBTC: number | null;
  USDCx: number | null;
};

export type ProcessorBalances = {
  STX: number;
  sBTC: number;
  USDCx: number;
};

export type TxSyncResult =
  | {
      status: "pending";
    }
  | {
      status: "success";
      resultRepr: string | null;
      onchainId: string | null;
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

function parseOkAsciiResult(repr: string | null) {
  if (!repr) {
    return null;
  }

  const match = /^\(ok\s+"([^"]+)"\)$/.exec(repr.trim());
  return match?.[1] ?? null;
}

function atomicToAmount(value: string | number | null | undefined, decimals: number) {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  return Number(normalized) / 10 ** decimals;
}

function unwrapCvScalar(value: any): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  if (typeof value === "object" && "value" in value) {
    return unwrapCvScalar(value.value);
  }

  return null;
}

function extractBalanceAmount(value: any): string | number | null {
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
  decimals: number
) {
  const key = Object.keys(fungibleTokens).find((assetId) => assetId.startsWith(`${contractId}::`));
  if (!key) {
    return 0;
  }

  return atomicToAmount(fungibleTokens[key]?.balance, decimals);
}

export async function getWalletBalances(address: string): Promise<WalletBalances> {
  const response = await fetch(`${getStacksApiUrl()}/extended/v1/address/${address}/balances`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch wallet balances for ${address}.`);
  }

  const payload = await response.json();
  const fungibleTokens = (payload.fungible_tokens ?? {}) as Record<string, { balance?: string | number }>;

  return {
    STX: atomicToAmount(payload.stx?.balance, 6),
    sBTC: findTokenBalance(fungibleTokens, tokenContracts.sBTC, 8),
    USDCx: findTokenBalance(fungibleTokens, tokenContracts.USDCx, 6),
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
      body: JSON.stringify({
        sender: contractAddress,
        arguments: args,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to call read-only function ${functionName}.`);
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

      if (!payload.okay) {
        return [currency, 0] as const;
      }

      const cv = hexToCV(payload.result);
      const value = cvToValue(cv);
      const rawAmount = extractBalanceAmount(value);
      const amount = atomicToAmount(rawAmount ?? 0, currency === "sBTC" ? 8 : 6) ?? 0;

      return [currency, amount] as const;
    })
  );

  return Object.fromEntries(results) as ProcessorBalances;
}

export async function syncTransaction(txId: string): Promise<TxSyncResult> {
  const response = await fetch(`${getStacksApiUrl()}/extended/v1/tx/${txId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transaction ${txId} from Stacks API.`);
  }

  const payload = await response.json();
  const status = payload.tx_status as string | undefined;
  const resultRepr = payload.tx_result?.repr ?? null;
  const confirmedAt = typeof payload.burn_block_time === "number" ? payload.burn_block_time : null;

  if (!status || status === "pending") {
    return { status: "pending" };
  }

  if (status === "success") {
    return {
      status: "success",
      resultRepr,
      onchainId: parseOkAsciiResult(resultRepr),
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

export async function syncInvoiceCreationTx(txId: string): Promise<TxSyncResult> {
  return syncTransaction(txId);
}
