import { normalizeTransactionId } from "./transaction-id";
import { intentValue } from "./contract-values";
import { paymentPostConditions } from "./payment-postconditions";
import { request } from "@stacks/connect";
import { getConnectedProvider, getConnectedWalletAddress } from "./wallet-connection";
export { getConnectedWalletAddress } from "./wallet-connection";

type ContractIntentArg =
  | { type: "principal"; value: string }
  | { type: "uint"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "string-ascii"; value: string }
  | { type: "string-utf8"; value: string }
  | { type: "optional-string-ascii"; value: string | null }
  | { type: "optional-uint"; value: string | null }
  | { type: "optional-buffer"; value: string | null };

export type StackPayContractIntent = {
  contractId: string;
  contractName: string;
  functionName: string;
  network: string;
  arguments: ContractIntentArg[];
  notes: string[];
};

export async function submitContractIntent(
  intent: StackPayContractIntent,
  callbacks: {
    onFinish?: (data: { txId: string }) => void;
    onCancel?: () => void;
  } = {}
) {
  const [contractAddress, contractName] = intent.contractId.split(".");

  if (!contractAddress || !contractName) {
    throw new Error("Invalid contract id.");
  }

  const sender = getConnectedWalletAddress();
  if (!sender) throw new Error("Connect a wallet before submitting a transaction.");
  const tokenAssets = configuredTokenAssets();

  try {
    const result = await request({ provider: getConnectedProvider(), enableLocalStorage: false }, "stx_callContract", {
      address: sender as `S${string}`,
      network: intent.network === "mainnet" ? "mainnet" : "testnet",
      postConditionMode: "deny",
      postConditions: paymentPostConditions(intent, sender, tokenAssets),
      contract: intent.contractId as `${string}.${string}`,
      functionName: intent.functionName,
      functionArgs: intent.arguments.map(intentValue),
    });
    finishWalletRequest(result.txid, callbacks);
  } catch (error) {
    cancelOrThrow(error, callbacks);
  }
}

/** Native STX transfer (refunds). The wallet shows the exact recipient, amount and memo. */
export async function submitStxTransfer(
  transfer: { recipient: string; amountMicroStx: string; memo: string; network: string },
  callbacks: { onFinish?: (data: { txId: string }) => void; onCancel?: () => void } = {}
) {
  const sender = getConnectedWalletAddress();
  if (!sender) throw new Error("Connect a wallet before submitting a transaction.");
  if (!/^\d+$/.test(transfer.amountMicroStx) || BigInt(transfer.amountMicroStx) <= 0n) throw new Error("Invalid transfer amount.");
  try {
    const result = await request({ provider: getConnectedProvider(), enableLocalStorage: false }, "stx_transferStx", {
      recipient: transfer.recipient,
      amount: transfer.amountMicroStx,
      memo: transfer.memo,
      network: transfer.network === "mainnet" ? "mainnet" : "testnet",
    });
    finishWalletRequest(result.txid, callbacks);
  } catch (error) {
    cancelOrThrow(error, callbacks);
  }
}

function finishWalletRequest(txid: string | undefined, callbacks: { onFinish?: (data: { txId: string }) => void }) {
  const txId = normalizeTransactionId(txid ?? "");
  if (!txId) throw new Error("The wallet did not return a valid broadcast transaction id. Check wallet activity before retrying.");
  callbacks.onFinish?.({ txId });
}

function cancelOrThrow(error: unknown, callbacks: { onCancel?: () => void }) {
  const code = (error as { code?: number } | null)?.code;
  if (code === -31001 || code === -32000 || code === 4001) { callbacks.onCancel?.(); return; }
  throw error;
}

function configuredTokenAssets(): Record<string, string> {
  return {
    [process.env.NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID ?? "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token"]: process.env.NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME ?? "",
    [process.env.NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID ?? "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"]: process.env.NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME ?? "",
  };
}
