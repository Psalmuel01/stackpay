import { expect, it } from "vitest";
import { atomicToDecimal, decimalToAtomic, formatDecimalAmount, parseAtomicUnits, sumDecimalAmounts, toAtomicAmount } from "../lib/amounts";

it("converts between decimals and base units exactly", () => {
  expect(toAtomicAmount("0.00000001", "sBTC")).toBe("1");
  expect(toAtomicAmount("1.5", "STX")).toBe("1500000");
  expect(atomicToDecimal(1n, "sBTC")).toBe("0.00000001");
  expect(atomicToDecimal("1500000", "STX")).toBe("1.5");
  expect(atomicToDecimal(0n, "USDCx")).toBe("0");
  expect(decimalToAtomic("0", "STX")).toBe(0n);
});

it("rejects over-precise, negative, and malformed amounts", () => {
  expect(() => toAtomicAmount("0.000000001", "sBTC")).toThrow(/decimal places/);
  expect(() => toAtomicAmount("0.0000001", "STX")).toThrow(/decimal places/);
  expect(() => toAtomicAmount("-1", "STX")).toThrow();
  expect(() => toAtomicAmount("1,000", "STX")).toThrow();
  expect(() => decimalToAtomic("abc", "STX")).toThrow();
  expect(parseAtomicUnits("-5")).toBeNull();
  expect(parseAtomicUnits("1.5")).toBeNull();
  expect(parseAtomicUnits((1n << 128n).toString())).toBeNull();
});

it("sums without floating point error", () => {
  // 0.1 + 0.2 is 0.30000000000000004 in floating point.
  expect(sumDecimalAmounts(["0.1", "0.2"], "USDCx")).toBe("0.3");
  expect(sumDecimalAmounts(["0.00000001", "0.00000002"], "sBTC")).toBe("0.00000003");
  expect(sumDecimalAmounts([], "STX")).toBe("0");
  // Beyond Number.MAX_SAFE_INTEGER base units.
  expect(sumDecimalAmounts(["9007199254.740993", "1"], "STX")).toBe("9007199255.740993");
});

it("formats with grouping and no precision loss", () => {
  expect(formatDecimalAmount("1234567.890123", "STX")).toBe("1,234,567.890123");
  expect(formatDecimalAmount("0.00000001", "sBTC")).toBe("0.00000001");
  expect(formatDecimalAmount("12", "USDCx")).toBe("12");
});
