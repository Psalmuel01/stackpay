"use client";
import { openSignatureRequestPopup } from "@stacks/connect";
import { getAppDetails, getConnectedWalletAddress, stacksNetwork, userSession } from "./stacks";
let signingIn: Promise<void> | null = null;
export function signInWithWallet() {
  if (signingIn) return signingIn;
  signingIn = (async () => {
    const walletAddress = getConnectedWalletAddress();
    if (!walletAddress) throw new Error("Connect a wallet first.");
    const challengeResponse = await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress }) });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok) throw new Error(challenge.error?.message ?? "Could not start sign-in.");
    const signed = await new Promise<{ signature: string; publicKey: string }>((resolve, reject) => {
      void openSignatureRequestPopup({ message: challenge.data.message, appDetails: getAppDetails(), userSession, network: stacksNetwork, stxAddress: walletAddress,
        onFinish: resolve, onCancel: () => reject(new Error("Sign-in was canceled.")) }).catch(reject);
    });
    if (getConnectedWalletAddress() !== walletAddress) throw new Error("Wallet changed. Please sign in again.");
    const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Could not verify wallet signature.");
    window.dispatchEvent(new Event("stackpay:auth"));
  })().finally(() => { signingIn = null; });
  return signingIn;
}
