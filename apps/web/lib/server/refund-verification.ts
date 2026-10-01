import { ClarityType, bufferCV, cvToHex, hexToCV, principalCV, someCV, uintCV } from "@stacks/transactions";
import { ApiError } from "./api-error";

/** What a refund transaction must be: from the merchant, to the original payer, exact amount, asset and memo. */
export type ExpectedRefund = {
  network: string;
  sender: string;
  recipient: string;
  amountUnits: string;
  memo: string;
  /** SIP-010 token contract; null for native STX. */
  tokenContract: string | null;
};

function reject(): never { throw new ApiError(422, "transaction_mismatch", "Transaction does not match the expected refund."); }

/** Refund memos are short ASCII tags (`SPR:inv_…`) that fit both the STX memo and a (buff 34). */
export function refundMemo(invoicePublicId: string) {
  const memo = `SPR:${invoicePublicId}`;
  if (!/^[\x20-\x7e]{1,34}$/.test(memo)) throw new Error("Refund memo is too long.");
  return memo;
}

export function memoHex(memo: string) {
  return Buffer.from(memo, "ascii").toString("hex");
}

/** Verifies an anchored, successful refund transfer. Returns the verified sender for symmetry with contract calls. */
export function verifyRefundPayload(payload: any, txId: string, expected: ExpectedRefund) {
  const prefix = expected.network === "mainnet" ? "SP" : "ST";
  if (!["testnet", "mainnet"].includes(expected.network) || payload.tx_id?.toLowerCase() !== txId.toLowerCase() ||
      payload.tx_status !== "success" || payload.canonical !== true || payload.microblock_canonical === false || payload.is_unanchored !== false ||
      !Number.isInteger(payload.block_height) || payload.block_height <= 0 ||
      payload.sender_address !== expected.sender || !String(expected.sender).startsWith(prefix)) reject();
  try {
    if (expected.tokenContract === null) {
      const transfer = payload.token_transfer;
      if (payload.tx_type !== "token_transfer" || transfer?.recipient_address !== expected.recipient || String(transfer?.amount) !== expected.amountUnits) reject();
      // The node pads STX memos with NUL bytes to 34 bytes.
      const memo = String(transfer?.memo ?? "").replace(/^0x/, "").replace(/(?:00)+$/, "");
      if (memo !== memoHex(expected.memo)) reject();
    } else {
      const call = payload.contract_call;
      if (payload.tx_type !== "contract_call" || call?.contract_id !== expected.tokenContract || call?.function_name !== "transfer" ||
          !Array.isArray(call?.function_args) || call.function_args.length !== 4) reject();
      const wanted = [
        uintCV(expected.amountUnits),
        principalCV(expected.sender),
        principalCV(expected.recipient),
        someCV(bufferCV(Buffer.from(expected.memo, "ascii"))),
      ];
      wanted.forEach((cv, i) => {
        if (cvToHex(hexToCV(call.function_args[i].hex)) !== cvToHex(cv)) reject();
      });
      const result = hexToCV(payload.tx_result.hex);
      if (result.type !== ClarityType.ResponseOk || result.value.type !== ClarityType.BoolTrue) reject();
    }
  } catch {
    reject();
  }
  return { onchainId: null, senderAddress: payload.sender_address as string };
}
