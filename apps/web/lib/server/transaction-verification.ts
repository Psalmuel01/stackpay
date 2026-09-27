import { ClarityType, cvToHex, hexToCV, principalCV, responseOkCV, tupleCV, uintCV } from "@stacks/transactions";
import { intentValue, type IntentArgument } from "../contract-values";
import { ApiError } from "./api-error";
export type ExpectedTransaction = {
  contractId: string;
  functionName: string;
  network: string;
  arguments: IntentArgument[];
  sender?: string;
};
function reject(): never { throw new ApiError(422, "transaction_mismatch", "Transaction does not match the expected operation."); }
export function verifyTransactionPayload(payload: any, txId: string, expected: ExpectedTransaction) {
  const call = payload.contract_call;
  const prefix = expected.network === "mainnet" ? "SP" : "ST";
  if (!["testnet", "mainnet"].includes(expected.network) || payload.tx_id?.toLowerCase() !== txId.toLowerCase() || payload.tx_type !== "contract_call" ||
      !expected.contractId.startsWith(prefix) || payload.tx_status !== "success" ||
      payload.canonical !== true || payload.microblock_canonical === false || payload.is_unanchored !== false ||
      !Number.isInteger(payload.burn_block_time) || payload.burn_block_time <= 0 ||
      !Number.isInteger(payload.block_height) || payload.block_height <= 0 ||
      (expected.sender && payload.sender_address !== expected.sender) ||
      typeof payload.sender_address !== "string" || !payload.sender_address.startsWith(prefix) ||
      call?.contract_id !== expected.contractId || call?.function_name !== expected.functionName ||
      !Array.isArray(call?.function_args) || call.function_args.length !== expected.arguments.length) reject();
  try {
    expected.arguments.forEach((arg, i) => {
      if (cvToHex(hexToCV(call.function_args[i].hex)) !== cvToHex(intentValue(arg))) reject();
    });
    const result = hexToCV(payload.tx_result.hex);
    if (result.type !== ClarityType.ResponseOk) reject();
    if (expected.functionName.startsWith("withdraw-")) {
      const amountIndex = expected.functionName === "withdraw-stx-to" ? 0 : 1;
      const recipientIndex = expected.functionName === "withdraw-stx-to" ? 1 : 3;
      const wanted = responseOkCV(tupleCV({ withdrawn: uintCV(String(expected.arguments[amountIndex].value)), recipient: principalCV(String(expected.arguments[recipientIndex].value)) }));
      if (cvToHex(result) !== cvToHex(wanted)) reject();
      return { onchainId: null, senderAddress: payload.sender_address as string };
    }
    if (result.value.type !== ClarityType.StringASCII || !result.value.value || result.value.value.length > 85) reject();
    return { onchainId: result.value.value, senderAddress: payload.sender_address as string };
  } catch { return reject(); }
}
