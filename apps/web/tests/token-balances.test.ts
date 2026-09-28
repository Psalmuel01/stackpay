import { afterEach, expect, it, vi } from "vitest";
import { getWalletBalances, tokenContracts } from "../lib/server/stacks-api";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("reports transferable sBTC rather than the first asset under its contract", async () => {
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME", "sbtc-token");
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME", "usdcx-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    stx: { balance: "1000000" }, fungible_tokens: {
      [`${tokenContracts.sBTC}::sbtc-token-locked`]: { balance: "900000000" },
      [`${tokenContracts.sBTC}::sbtc-token`]: { balance: "100000000" },
      [`${tokenContracts.USDCx}::usdcx-token`]: { balance: "2000000" },
    },
  }) }));
  expect(await getWalletBalances("ST000000000000000000002AMW42H")).toEqual({ STX: 1, sBTC: 1, USDCx: 2 });
});
it("does not treat locked-only holdings as spendable", async () => {
  vi.stubEnv("NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME", "sbtc-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    stx: { balance: "0" }, fungible_tokens: { [`${tokenContracts.sBTC}::sbtc-token-locked`]: { balance: "900000000" } },
  }) }));
  expect((await getWalletBalances("ST000000000000000000002AMW42H")).sBTC).toBe(0);
});
