"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Wallet, ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { getConnectedWalletAddress } from "@/lib/stacks";
import { signInWithWallet } from "@/lib/wallet-sign-in";

export default function MerchantAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
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
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error?.message ?? "Could not check sign-in.");
        if (!canceled)
          setAuthenticated(
            Boolean(
              wallet &&
                payload.data?.walletAddress === wallet &&
                getConnectedWalletAddress() === wallet,
            ),
          );
      } catch (error) {
        if (!canceled) {
          setAuthenticated(false);
          setError(
            error instanceof Error ? error.message : "Could not check sign-in.",
          );
        }
      } finally {
        if (!canceled) setChecking(false);
      }
    }
    void check();
    const timer = window.setInterval(check, 15000);
    window.addEventListener("stackpay:auth", check);
    window.addEventListener("focus", check);
    return () => {
      canceled = true;
      clearInterval(timer);
      window.removeEventListener("stackpay:auth", check);
      window.removeEventListener("focus", check);
    };
  }, [publicPage]);
  if (publicPage || authenticated) return <>{children}</>;
  return (
    <section className="mx-auto my-6 max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#111316] md:my-12">
      <div className="border-b border-white/10 px-6 py-5 sm:px-9">
        <p className="flex items-center gap-2 text-xs font-medium text-white/50">
          <ShieldCheck size={15} className="text-[#ff9069]" />
          Your merchant workspace
        </p>
      </div>
      <div className="px-6 py-8 sm:p-9">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[#fc6532]/20 bg-[#fc6532]/10 text-[#ff9069]">
          <Wallet size={23} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your business. Your wallet.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-white/60">
          Connect your wallet and sign in to create invoices, track payments,
          and manage your settlements.
        </p>
        <ol className="my-7 grid gap-3 sm:grid-cols-2">
          <li
            className={`rounded-xl border p-4 ${connected ? "border-[#fc6532]/25 bg-[#fc6532]/5" : "border-white/15 bg-white/[0.025]"}`}
          >
            <p className="text-xs text-white/40">Step 1</p>
            <p className="mt-2 text-sm font-medium">
              {connected ? "Wallet connected" : "Connect a wallet"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/50">
              Use Leather or Xverse from the header.
            </p>
          </li>
          <li className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-xs text-white/40">Step 2</p>
            <p className="mt-2 text-sm font-medium">Sign a secure message</p>
            <p className="mt-1 text-xs leading-5 text-white/50">
              No transaction. No network fee.
            </p>
          </li>
        </ol>
        <p role="status" className="text-sm leading-6 text-white/60">
          {checking
            ? "Checking your session…"
            : connected
              ? "Your wallet is ready. Sign the message to continue."
              : "Choose Connect Wallet above to get started."}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm leading-6 text-rose-200"
          >
            {error}
          </p>
        )}
        {connected && !checking && (
          <button
            disabled={busy}
            className="primary-button mt-5 disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await signInWithWallet();
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "Sign-in failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Waiting for signature…" : "Sign in with wallet"}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-5 text-xs sm:px-9">
        <span className="text-white/40">New to StackPay?</span>
        <Link
          href="/docs#quickstart"
          className="text-[#ff9069] hover:text-white"
        >
          Follow the getting started guide →
        </Link>
      </div>
    </section>
  );
}
