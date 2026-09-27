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
  | { type: "optional-uint"; value: string | null };

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
  const tokenAssets: Record<string, string> = {
    [process.env.NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID ?? "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token"]: process.env.NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME ?? "",
    [process.env.NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID ?? "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"]: process.env.NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME ?? "",
  };

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
    if (!result.txid) throw new Error("The wallet did not return a broadcast transaction id.");
    callbacks.onFinish?.({ txId: result.txid });
  } catch (error) {
    const code = (error as { code?: number } | null)?.code;
    if (code === -31001 || code === -32000 || code === 4001) { callbacks.onCancel?.(); return; }
    throw error;
  }
}
