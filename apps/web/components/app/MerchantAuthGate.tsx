"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getConnectedWalletAddress } from "@/lib/stacks";
import { signInWithWallet } from "@/lib/wallet-sign-in";

export default function MerchantAuthGate({ children }: { children: React.ReactNode }) {
  const publicPage = ["/docs", "/explorer"].includes(usePathname());
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (publicPage) return;
    let canceled = false;
    let lastWallet: string | null | undefined;
    async function check() {
      const wallet = getConnectedWalletAddress();
      if (!canceled) setConnected(Boolean(wallet));
      if (wallet !== lastWallet && !canceled) setAuthenticated(false);
      lastWallet = wallet;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Could not check sign-in.");
        if (!canceled) setAuthenticated(Boolean(wallet && payload.data?.walletAddress === wallet && getConnectedWalletAddress() === wallet));
      } catch (error) {
        if (!canceled) { setAuthenticated(false); setError(error instanceof Error ? error.message : "Could not check sign-in."); }
      } finally { if (!canceled) setChecking(false); }
    }
    void check();
    const timer = window.setInterval(check, 15000);
    window.addEventListener("stackpay:auth", check);
    window.addEventListener("focus", check);
    return () => { canceled = true; clearInterval(timer); window.removeEventListener("stackpay:auth", check); window.removeEventListener("focus", check); };
  }, [publicPage]);
  if (publicPage || authenticated) return <>{children}</>;
  return <section className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8">
    <h1 className="text-2xl font-semibold">Sign in to your merchant account</h1>
    <p className="mt-3 text-white/60">{checking ? "Checking your session…" : connected ? "Sign a message to prove you own this wallet. This does not send a transaction or cost a fee." : "Connect your wallet using the button above, then sign in to manage your payments."}</p>
    {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
    {connected && !checking && <button disabled={busy} className="mt-5 rounded-full bg-orange-500 px-5 py-3 font-semibold text-black disabled:opacity-50" onClick={async () => {
      setBusy(true); setError(null);
      try { await signInWithWallet(); } catch (error) { setError(error instanceof Error ? error.message : "Sign-in failed."); } finally { setBusy(false); }
    }}>{busy ? "Waiting for signature…" : "Sign in with wallet"}</button>}
  </section>;
}
