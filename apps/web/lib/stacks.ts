import { AppConfig, UserSession } from "@stacks/auth";
import { openContractCall } from "@stacks/connect";
import { StacksMainnet, StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  noneCV,
  PostConditionMode,
  principalCV,
  someCV,
  stringAsciiCV,
  stringUtf8CV,
  trueCV,
  falseCV,
  uintCV,
  type ClarityValue,
} from "@stacks/transactions";

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

function isPaymentFunction(functionName: string) {
  return (
    functionName === "process-stx-payment" ||
    functionName === "process-sip-010-payment" ||
    functionName === "withdraw-stx-to" ||
    functionName === "withdraw-token-to"
  );
}

function toClarityValue(arg: ContractIntentArg): ClarityValue {
  switch (arg.type) {
    case "principal":
      return principalCV(arg.value);
    case "uint":
      return uintCV(BigInt(arg.value));
    case "bool":
      return arg.value ? trueCV() : falseCV();
    case "string-ascii":
      return stringAsciiCV(arg.value);
    case "string-utf8":
      return stringUtf8CV(arg.value);
    case "optional-string-ascii":
      return arg.value ? someCV(stringAsciiCV(arg.value)) : noneCV();
    case "optional-uint":
      return arg.value ? someCV(uintCV(BigInt(arg.value))) : noneCV();
    default:
      return noneCV();
  }
}

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

  console.log("[stackpay:tx] submit.intent", intent);

  return openContractCall({
    userSession,
    network: intent.network === "mainnet" ? "mainnet" : "testnet",
    anchorMode: AnchorMode.Any,
    postConditionMode: isPaymentFunction(intent.functionName)
      ? PostConditionMode.Allow
      : PostConditionMode.Deny,
    postConditions: [],
    contractAddress,
    contractName,
    functionName: intent.functionName,
    functionArgs: intent.arguments.map(toClarityValue),
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
