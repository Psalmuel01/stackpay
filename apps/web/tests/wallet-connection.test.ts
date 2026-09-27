import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { privateKeyToPublic, publicKeyToAddress } from "@stacks/transactions";
const sdk = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), getSelectedProviderId: vi.fn(), request: vi.fn() }));
vi.mock("@stacks/connect", () => sdk);
import { connectWallet, getConnectedProvider, getConnectedWalletAddress, signWalletMessage } from "../lib/wallet-connection";
const publicKey = privateKeyToPublic("1".repeat(64) + "01") as string;
const address = publicKeyToAddress(publicKey, "testnet");
const leather = { request: vi.fn() }, xverse = { request: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, dispatchEvent: vi.fn(), LeatherProvider: leather, XverseProviders: { BitcoinProvider: xverse } });
  sdk.connect.mockResolvedValue({ addresses: [{ address, publicKey }] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each([["LeatherProvider", leather], ["XverseProviders.BitcoinProvider", xverse]])("routes signing to selected %s with both wallets installed", async (id, provider) => {
  sdk.getSelectedProviderId.mockReturnValue(id);
  await expect(connectWallet()).resolves.toBe(address);
  await signWalletMessage("challenge");
  expect(sdk.request).toHaveBeenCalledWith({ provider, enableLocalStorage: false }, "stx_signMessage", { message: "challenge", publicKey });
});
it("does not silently switch wallets after provider selection changes", async () => {
  sdk.getSelectedProviderId.mockReturnValue("LeatherProvider");
  await connectWallet();
  sdk.getSelectedProviderId.mockReturnValue("XverseProviders.BitcoinProvider");
  expect(getConnectedWalletAddress()).toBeNull();
  expect(() => getConnectedProvider()).toThrow("Reconnect");
});
it("rejects the wrong network", async () => {
  sdk.getSelectedProviderId.mockReturnValue("LeatherProvider");
  sdk.connect.mockResolvedValue({ addresses: [{ address: publicKeyToAddress(publicKey, "mainnet"), publicKey }] });
  await expect(connectWallet()).rejects.toThrow("testnet");
  expect(getConnectedWalletAddress()).toBeNull();
});
