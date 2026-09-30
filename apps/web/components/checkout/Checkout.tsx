"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import TokenLogo from "@/components/TokenLogo";
import { cn } from "@/components/cn";
import type { Currency } from "@/lib/format";

/* Shared building blocks for the customer-facing hosted checkout pages
   (/pay/[invoiceId] and /pay/link/[slug]). These pages sit outside the
   console shell and follow the visitor's theme. */

/** Full-page frame: merchant name on top, one centred column, quiet footer. */
export function CheckoutShell({
  merchantName,
  children,
}: {
  merchantName?: string | null;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="relative flex min-h-screen flex-col overflow-hidden bg-canvas">
      <div className="relative mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4 pb-8 pt-8 sm:pt-16">
        {merchantName ? (
          <header className="mb-5 flex items-center gap-3 px-1">
            <MerchantMark name={merchantName} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold leading-6 tracking-[-0.01em] text-fg">{merchantName}</h1>
              <p className="text-sm text-muted">Secure checkout</p>
            </div>
            <NetworkPill />
          </header>
        ) : null}
        <div className="flex-1">{children}</div>
        <CheckoutFooter />
      </div>
    </main>
  );
}

/** Tells payers up front when a checkout uses test funds. */
function NetworkPill() {
  const mainnet = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        mainnet ? "border-line-strong bg-panel text-fg-2" : "border-warning/30 bg-warning/10 text-warning"
      )}
      title={mainnet ? "Payments settle on Stacks mainnet" : "This checkout uses Stacks testnet funds"}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", mainnet ? "bg-success" : "bg-warning")} />
      {mainnet ? "Stacks" : "Testnet"}
    </span>
  );
}

function MerchantMark({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "M";
  return (
    <span
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-line-strong bg-panel text-lg font-semibold text-fg shadow-card"
    >
      {initial}
    </span>
  );
}

export function CheckoutFooter() {
  return (
    <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[14px] text-muted">
      <span>Payments settle on Stacks</span>
      <span aria-hidden="true">·</span>
      <a
        href="/"
        className="inline-flex items-center gap-1.5 rounded-control font-medium text-fg-2 transition hover:text-fg"
      >
        Powered by <Logo size={20} wordmark={false} /> <span>StackPay</span>
      </a>
    </footer>
  );
}

/** Large, tabular amount with a lighter currency code. */
export function AmountDisplay({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: Currency;
  className?: string;
}) {
  const value = Number.isFinite(amount) ? (currency === "STX" ? amount.toLocaleString() : String(amount)) : "0";
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2.5 text-fg", className)}>
      <span className="text-[44px] font-semibold leading-[1.05] tracking-[-0.04em] tabular-nums sm:text-[52px]">{value}</span>
      <span className="inline-flex items-center gap-1.5 self-center text-lg font-medium text-fg-2">
        <AssetMark currency={currency} />
        {currency}
      </span>
    </p>
  );
}

/** The official token logo, as on the merchant dashboard. */
export function AssetMark({ currency }: { currency: Currency }) {
  return <TokenLogo token={currency} size={24} />;
}

/** Receipt-style perforation between a card's summary and its details. */
export function TicketDivider() {
  return (
    <div aria-hidden="true" className="relative h-0">
      <div className="mx-5 border-t border-dashed border-line-strong sm:mx-6" />
      <span className="absolute -left-[11px] top-0 h-5 w-5 -translate-y-1/2 rounded-full border border-line bg-canvas" />
      <span className="absolute -right-[11px] top-0 h-5 w-5 -translate-y-1/2 rounded-full border border-line bg-canvas" />
    </div>
  );
}

/** Definition list of checkout details. */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

export function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="min-w-0 text-sm text-fg">{children}</dd>
    </div>
  );
}

export function middleTruncate(value: string, head = 8, tail = 8) {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Monospace value (address, id) with a copy button. */
export function CopyValue({ value, label, truncate = true }: { value: string; label: string; truncate?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard access can be blocked; the full value is still in the title attribute. */
    }
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-[14px] text-fg-2" title={value}>
        {truncate ? middleTruncate(value) : value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="-my-2 grid h-10 w-10 shrink-0 place-items-center rounded-control text-muted transition hover:bg-subtle hover:text-fg"
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check size={16} className="text-success" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status">{copied ? `${label} copied` : ""}</span>
    </span>
  );
}

/** Inline progress block shown while the wallet or chain is working. */
export function PaymentProgress({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-[12px] border border-line bg-subtle px-4 py-3.5">
      <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-accent-text" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{title}</p>
        {children ? <p className="mt-0.5 text-sm text-muted">{children}</p> : null}
      </div>
    </div>
  );
}

/** Skeleton shaped like a checkout card. */
export function CheckoutSkeleton({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen flex-col bg-canvas" aria-busy="true">
      <span className="sr-only" role="status">{label}</span>
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4 pb-8 pt-8 sm:pt-16" aria-hidden="true">
        <div className="mb-5 flex items-center gap-3 px-1">
          <div className="skeleton h-10 w-10 rounded-control" />
          <div className="skeleton h-5 w-36" />
        </div>
        <div className="card overflow-hidden">
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
            <div className="skeleton h-11 w-48" />
            <div className="skeleton h-4 w-64 max-w-full" />
          </div>
          <div className="space-y-5 border-t border-line p-5 sm:p-6">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-4 w-44" />
              </div>
            ))}
          </div>
          <div className="space-y-4 border-t border-line bg-subtle p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-10 w-36 rounded-control" />
            </div>
            <div className="skeleton h-12 w-full rounded-control" />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Customer-facing "not found" state — no console links. */
export function CheckoutNotFound({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <CheckoutShell>
      <div className="card">
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">{icon}</span>
          <h1 className="text-lg font-semibold text-fg">{title}</h1>
          <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-muted">{children}</div>
        </div>
      </div>
    </CheckoutShell>
  );
}
