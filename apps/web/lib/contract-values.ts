import { falseCV, noneCV, principalCV, someCV, stringAsciiCV, stringUtf8CV, trueCV, uintCV, type ClarityValue } from "@stacks/transactions";
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
    default: throw new Error("Unsupported contract argument.");
  }
}
