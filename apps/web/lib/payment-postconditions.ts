import { Pc, type PostCondition } from "@stacks/transactions";
import type { IntentArgument } from "./contract-values";
export function paymentPostConditions(intent: { contractId: string; functionName: string; arguments: IntentArgument[] }, sender: string, tokenAssets: Record<string, string>): PostCondition[] {
  const { functionName: fn, arguments: args } = intent;
  if (fn === "transfer") return tokenTransferPostConditions(intent, sender, tokenAssets);
  if (!["process-stx-payment", "process-sip-010-payment", "withdraw-stx-to", "withdraw-token-to"].includes(fn)) return [];
  const withdrawal = fn.startsWith("withdraw-");
  const amountIndex = fn === "withdraw-stx-to" ? 0 : 1;
  const amount = String(args[amountIndex]?.value);
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error("Invalid transfer amount.");
  const owner = withdrawal ? intent.contractId : sender;
  const condition = Pc.principal(owner as `${string}.${string}`).willSendEq(amount);
  if (fn === "process-stx-payment" || fn === "withdraw-stx-to") return [condition.ustx()];
  const token = String(args[2]?.value);
  const assetName = tokenAssets[token];
  if (!assetName || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(assetName)) throw new Error("Token asset name is not configured. Please contact the merchant.");
  return [condition.ft(token as `${string}.${string}`, assetName)];
}

/** SIP-010 transfer (refunds): only allowlisted tokens, sent by the signer, exactly the amount. */
function tokenTransferPostConditions(intent: { contractId: string; arguments: IntentArgument[] }, sender: string, tokenAssets: Record<string, string>): PostCondition[] {
  const [amountArg, fromArg] = intent.arguments;
  const amount = String(amountArg?.value);
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error("Invalid transfer amount.");
  if (fromArg?.value !== sender) throw new Error("Transfers must be sent from the connected wallet.");
  const assetName = tokenAssets[intent.contractId];
  if (!assetName || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(assetName)) throw new Error("Token asset name is not configured.");
  return [Pc.principal(sender).willSendEq(amount).ft(intent.contractId as `${string}.${string}`, assetName)];
}
