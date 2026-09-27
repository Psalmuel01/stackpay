import { Pc, type PostCondition } from "@stacks/transactions";
import type { IntentArgument } from "./contract-values";
export function paymentPostConditions(intent: { contractId: string; functionName: string; arguments: IntentArgument[] }, sender: string, tokenAssets: Record<string, string>): PostCondition[] {
  const { functionName: fn, arguments: args } = intent;
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
