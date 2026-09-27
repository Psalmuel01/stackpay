"use client";

import { connect, disconnect, getSelectedProviderId, request, type StacksProvider } from "@stacks/connect";
import { publicKeyToAddress, validateStacksAddress } from "@stacks/transactions";

const storageKey = "stackpay.connected-wallet";
const supportedProviders = ["LeatherProvider", "XverseProviders.BitcoinProvider"];
type ConnectedWallet = { address: string; publicKey: string; providerId: string; network: string };
export const walletNetwork = () => process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";

export function getConnectedWallet(): ConnectedWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return null;
    const wallet = JSON.parse(stored) as ConnectedWallet;
    if (wallet.network !== walletNetwork() || !supportedProviders.includes(wallet.providerId) ||
        wallet.providerId !== getSelectedProviderId() || !validateStacksAddress(wallet.address) ||
        publicKeyToAddress(wallet.publicKey, walletNetwork()) !== wallet.address) return null;
    return wallet;
  } catch { return null; }
}

export function getConnectedWalletAddress() {
  return getConnectedWallet()?.address ?? null;
}

export function disconnectWallet() {
  disconnect();
  window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("stackpay:auth"));
}

export async function connectWallet() {
  // Clear cached addresses so reconnecting cannot retain an account from another wallet.
  disconnectWallet();
  try {
    const result = await connect({
      network: walletNetwork(),
      persistWalletSelect: true,
      approvedProviderIds: supportedProviders,
    });
    const prefix = walletNetwork() === "mainnet" ? "SP" : "ST";
    const account = result.addresses.find(entry => entry.address.startsWith(prefix) && validateStacksAddress(entry.address));
    const providerId = getSelectedProviderId();
    if (!account || !providerId || !supportedProviders.includes(providerId)) {
      throw new Error(`Switch your wallet to ${walletNetwork()} and connect a Stacks account.`);
    }
    if (publicKeyToAddress(account.publicKey, walletNetwork()) !== account.address) {
      throw new Error("The wallet returned an account that does not match its public key. Reconnect your wallet.");
    }
    const wallet: ConnectedWallet = { address: account.address, publicKey: account.publicKey, providerId, network: walletNetwork() };
    window.localStorage.setItem(storageKey, JSON.stringify(wallet));
    window.dispatchEvent(new Event("stackpay:auth"));
    return wallet.address;
  } catch (error) {
    disconnectWallet();
    throw error;
  }
}

export function getConnectedProvider(): StacksProvider {
  const wallet = getConnectedWallet();
  if (!wallet) throw new Error("Reconnect your wallet before continuing.");
  // Resolve the exact saved provider. Never fall back to another installed extension.
  const provider = wallet.providerId.split(".").reduce<any>((value, key) => value?.[key], window);
  if (typeof provider?.request !== "function") throw new Error("The connected wallet is unavailable. Unlock its extension and reconnect.");
  return provider;
}

export async function signWalletMessage(message: string) {
  const wallet = getConnectedWallet();
  if (!wallet) throw new Error("Reconnect your wallet before signing in.");
  return request({ provider: getConnectedProvider(), enableLocalStorage: false }, "stx_signMessage", {
    message,
    // Xverse uses this to select the Stacks account; Connect omits it for Leather.
    publicKey: wallet.publicKey,
  });
}

export function walletErrorMessage(error: unknown) {
  const code = (error as { code?: number } | null)?.code;
  if (code === -31001 || code === -32000 || code === 4001) return "Wallet request was canceled. You can try again.";
  return error instanceof Error ? error.message : "Could not connect to the wallet. Unlock the extension and try again.";
}
