"use client";
import { getConnectedWalletAddress, signWalletMessage, walletErrorMessage } from "./wallet-connection";
let signingIn: Promise<void> | null = null;

// A server error page (HTML) must surface as a readable message, not a JSON parse error.
async function readJson(response: Response, fallback: string) {
  try { return await response.json(); }
  catch { throw new Error(`${fallback} The server returned an unexpected response (${response.status}). Please try again.`); }
}
export function signInWithWallet() {
  if (signingIn) return signingIn;
  signingIn = (async () => {
    const walletAddress = getConnectedWalletAddress();
    if (!walletAddress) throw new Error("Connect a wallet first.");
    const challengeResponse = await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress }) });
    const challenge = await readJson(challengeResponse, "Could not start sign-in.");
    if (!challengeResponse.ok) throw new Error(challenge.error?.message ?? "Could not start sign-in.");
    let signed: { signature: string; publicKey: string };
    try { signed = await signWalletMessage(challenge.data.message); }
    catch (error) { throw new Error(walletErrorMessage(error)); }
    if (getConnectedWalletAddress() !== walletAddress) throw new Error("Wallet changed. Please sign in again.");
    const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) });
    const payload = await readJson(response, "Could not verify wallet signature.");
    if (!response.ok) throw new Error(payload.error?.message ?? "Could not verify wallet signature.");
    window.dispatchEvent(new Event("stackpay:auth"));
  })().finally(() => { signingIn = null; });
  return signingIn;
}
