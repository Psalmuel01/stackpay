import { intentValue } from "./contract-values";
import { paymentPostConditions } from "./payment-postconditions";
import { AppConfig, UserSession } from "@stacks/auth";
import { openContractCall } from "@stacks/connect";
import { StacksMainnet, StacksTestnet } from "@stacks/network";
import { AnchorMode, PostConditionMode } from "@stacks/transactions";

const appConfig = new AppConfig(["store_write", "publish_data"]);

export const userSession = new UserSession({ appConfig });

export const stacksNetwork =
  process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet"
    ? new StacksMainnet()
    : new StacksTestnet();

function getAppBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function getAppDetails() {
  const baseUrl = getAppBaseUrl().replace(/\/$/, "");
  const iconPath = process.env.NEXT_PUBLIC_APP_ICON ?? "/stackpay-icon.svg";
  const iconUrl = /^https?:\/\//.test(iconPath) ? iconPath : `${baseUrl}${iconPath.startsWith("/") ? iconPath : `/${iconPath}`}`;

  return {
    name: process.env.NEXT_PUBLIC_APP_NAME ?? "StackPay",
    icon: iconUrl,
    url: baseUrl,
  };
}

export function getConnectedWalletAddress() {
  if (!userSession.isUserSignedIn()) {
    return null;
  }

  const data = userSession.loadUserData();
  const networkKey =
    process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";

  return data.profile?.stxAddress?.[networkKey] ?? null;
}

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

  return openContractCall({
    userSession,
    network: intent.network === "mainnet" ? "mainnet" : "testnet",
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: paymentPostConditions(intent, sender, tokenAssets),
    contractAddress,
    contractName,
    functionName: intent.functionName,
    functionArgs: intent.arguments.map(intentValue),
    onFinish: (data) => {
      console.log("[stackpay:tx] wallet.finish", {
        functionName: intent.functionName,
        txId: data.txId,
      });
      callbacks.onFinish?.(data);
    },
    onCancel: () => {
      console.log("[stackpay:tx] wallet.cancel", {
        functionName: intent.functionName,
      });
      callbacks.onCancel?.();
    },
  });
}
