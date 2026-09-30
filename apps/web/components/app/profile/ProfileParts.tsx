"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Settings-style section: description column on the left, fields on the right (stacks below lg). */
export function ProfileSection({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="card p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-x-10">
        <div>
          <h2 id={id} className="text-base font-semibold text-fg">
            {title}
          </h2>
          <div className="mt-1.5 text-sm leading-relaxed text-muted">{description}</div>
        </div>
        <div className="min-w-0 space-y-5 lg:row-span-2">{children}</div>
        {aside ? <div className="min-w-0 lg:col-start-1 lg:row-start-2">{aside}</div> : null}
      </div>
    </section>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon shrink-0"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
      disabled={!value}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
    >
      {copied ? <Check size={16} aria-hidden="true" className="text-success" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

/** Mini hosted-checkout header showing how the merchant name appears to customers. */
export function CheckoutPreview({ name }: { name: string }) {
  const shown = name || "Your business name";
  const initial = (name.trim()[0] ?? "S").toUpperCase();

  return (
    <div className="well p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-fg-2">How customers see you</p>
        <p className="text-sm text-muted">Checkout preview</p>
      </div>
      <div
        className="mt-3 flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between"
        aria-hidden="true"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-base font-semibold text-accent-text">
            {initial}
          </span>
          <div className="min-w-0">
            <p className={`truncate text-base font-semibold ${name ? "text-fg" : "text-muted"}`}>{shown}</p>
            <p className="text-sm text-muted">Invoice · 0.0025 sBTC</p>
          </div>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent">
          Pay with wallet
        </span>
      </div>
    </div>
  );
}
