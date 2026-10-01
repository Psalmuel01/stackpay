import { bufferCV, falseCV, noneCV, principalCV, someCV, stringAsciiCV, stringUtf8CV, trueCV, uintCV, type ClarityValue } from "@stacks/transactions";
export type IntentArgument = { type: string; value: string | boolean | null };
export function intentValue(arg: IntentArgument): ClarityValue {
  switch (arg.type) {
    case "principal": return principalCV(String(arg.value));
    case "uint": return uintCV(String(arg.value));
    case "bool": return arg.value === true ? trueCV() : falseCV();
    case "string-ascii": return stringAsciiCV(String(arg.value));
    case "string-utf8": return stringUtf8CV(String(arg.value));
    case "optional-string-ascii": return arg.value == null ? noneCV() : someCV(stringAsciiCV(String(arg.value)));
    case "optional-uint": return arg.value == null ? noneCV() : someCV(uintCV(String(arg.value)));
    case "optional-buffer": return arg.value == null ? noneCV() : someCV(bufferCV(hexBytes(String(arg.value))));
    default: throw new Error("Unsupported contract argument.");
  }
}

/** Strict even-length hex (no 0x) to bytes; used for SIP-010 transfer memos. */
function hexBytes(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex) || hex.length > 68) throw new Error("Invalid buffer argument.");
  return Uint8Array.from(hex.match(/../g)!.map((byte) => parseInt(byte, 16)));
}
