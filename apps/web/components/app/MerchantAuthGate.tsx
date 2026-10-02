"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Coins, KeyRound, LayoutGrid, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import ConnectWalletButton from "./ConnectWalletButton";
import { getConnectedWalletAddress } from "@/lib/stacks";
import { walletNetwork } from "@/lib/wallet-connection";
import { signInWithWallet } from "@/lib/wallet-sign-in";

type StepState = "done" | "current" | "upcoming";

function Step({ index, state, title, description }: { index: number; state: StepState; title: string; description: React.ReactNode }) {
  return (
    <li className="flex gap-3.5" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden="true"
        className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[13px] font-semibold tabular-nums ${state === "done"
          ? "border-success/30 bg-success/10 text-success"
          : state === "current"
            ? "border-accent/60 bg-accent/10 text-accent-text"
            : "border-line-strong bg-subtle text-muted"
          }`}
      >
        {state === "done" ? <Check size={15} strokeWidth={2.5} /> : index}
      </span>
      <div className="min-w-0 pb-0.5">
        <p className={`text-sm font-semibold ${state === "upcoming" ? "text-fg-2" : "text-fg"}`}>
          {title}
          <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (current step)" : ""}</span>
        </p>
        <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{description}</p>
      </div>
    </li>
  );
}

function SessionSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">Checking your session…</span>
      <div className="space-y-4 pb-4" aria-hidden="true">
        <span className="skeleton block h-8 w-48" />
        <span className="skeleton block h-4 w-72 max-w-full" />
      </div>
      <div className="card h-40" aria-hidden="true" />
      <div className="grid gap-4 md:grid-cols-3" aria-hidden="true">
        <div className="card h-32" />
        <div className="card hidden h-32 md:block" />
        <div className="card hidden h-32 md:block" />
      </div>
    </div>
  );
}

export default function MerchantAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const publicPage = ["/docs"].includes(usePathname());
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
  if (checking) return <SessionSkeleton />;

  const address = connected ? getConnectedWalletAddress() : null;
  const network = walletNetwork() === "mainnet" ? "Mainnet" : "Testnet";

  return (
    <section
      aria-labelledby="sign-in-title"
      className="relative isolate py-2 sm:py-10"
    >
      <div className="card relative mx-auto w-full max-w-[460px] overflow-hidden">
        <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <div className="px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
          <div className="flex flex-col items-center text-center">
            <Logo size={44} wordmark={false} />
            <h1 id="sign-in-title" className="mt-5 text-2xl font-semibold text-fg">
              Sign in to StackPay
            </h1>
            <p className="mt-2 max-w-[340px] text-sm leading-relaxed text-muted">
              Your business, your wallet. Use the wallet that receives your
              payments to create invoices, track payments, and manage settlements.
            </p>
          </div>

          <ol className="well mt-7 space-y-4 p-4 sm:p-5">
            <Step
              index={1}
              state={connected ? "done" : "current"}
              title={connected ? "Wallet connected" : "Connect your wallet"}
              description={
                connected && address ? (
                  <span className="font-mono text-[13.5px] text-fg-2" title={address}>
                    {address.slice(0, 8)}…{address.slice(-6)}
                  </span>
                ) : (
                  `Leather or Xverse, set to ${network.toLowerCase()}.`
                )
              }
            />
            <Step
              index={2}
              state={connected ? "current" : "upcoming"}
              title="Sign a message"
              description="Proves this wallet is yours. Your wallet will ask you to approve it."
            />
          </ol>

          <p role="status" className="sr-only">
            {connected
              ? "Your wallet is ready. Sign the message to continue."
              : "Connect your wallet to get started."}
          </p>

          {error && (
            <p role="alert" className="alert alert-danger mt-5">
              {error}
            </p>
          )}

          <div className="mt-6">
            {connected ? (
              <button
                type="button"
                disabled={busy}
                className="btn btn-primary btn-lg w-full"
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
                {busy ? "Confirm in your wallet…" : "Sign in with wallet"}
                {!busy && <ArrowRight size={17} aria-hidden="true" />}
              </button>
            ) : (
              <ConnectWalletButton variant="inline" />
            )}
          </div>

          <p className="mt-4 text-balance text-center text-[14px] text-muted">
            <ShieldCheck size={16} aria-hidden="true" className="-mt-0.5 mr-1.5 inline-block text-success" />
            Signing is free and doesn’t create a transaction.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line bg-subtle px-5 py-4 text-[14px]">
          <span className="text-muted">New to StackPay?</span>
          <Link href="/docs/quickstart" className="link inline-flex items-center gap-1">
            Read the getting started guide
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <ul className="mx-auto mt-6 grid max-w-[680px] gap-x-6 gap-y-2.5 px-2 sm:mt-8 sm:grid-cols-3">
        {[
          { icon: Coins, text: "Get paid in sBTC, STX, and USDCx" },
          { icon: KeyRound, text: "No passwords. Your wallet is your login" },
          { icon: LayoutGrid, text: "Invoices, links, and QR in one place" },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-[14px] text-muted sm:justify-center sm:text-center">
            <Icon size={16} aria-hidden="true" className="shrink-0 text-fg-2" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
