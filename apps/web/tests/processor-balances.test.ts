import { afterEach, expect, it, vi } from "vitest";
import { Cl, cvToHex } from "@stacks/transactions";
import { getProcessorBalances } from "../lib/server/stacks-api";
import { ApiError } from "../lib/server/api-error";

const wallet = "ST000000000000000000002AMW42H";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function readOnly(result: unknown) {
  return { ok: true, json: async () => result };
}

it("reads uint balances exactly from the processor", async () => {
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", "ST000000000000000000002AMW42H.processor");
  const balance = (amount: bigint) => ({ okay: true, result: cvToHex(Cl.tuple({ amount: Cl.uint(amount) })) });
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(readOnly(balance(1_500_000n)))
    .mockResolvedValueOnce(readOnly(balance(12_345_678_901n)))
    .mockResolvedValueOnce(readOnly(balance(0n))));
  expect(await getProcessorBalances(wallet)).toEqual({ STX: "1.5", sBTC: "123.45678901", USDCx: "0" });
});

it("reports a failed read-only call as unavailable instead of a zero balance", async () => {
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", "ST000000000000000000002AMW42H.processor");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(readOnly({ okay: false, cause: "Unchecked(NoSuchContract)" })));
  await expect(getProcessorBalances(wallet)).rejects.toMatchObject({ status: 503, code: "chain_unavailable" });
});

it("reports an unreachable Stacks API as unavailable", async () => {
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", "ST000000000000000000002AMW42H.processor");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }));
  const error = await getProcessorBalances(wallet).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe("chain_unavailable");
});
