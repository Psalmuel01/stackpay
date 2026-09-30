"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Copy, ExternalLink, Link2, Plus, Wallet } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import { type Currency, formatCurrencyAmount } from "@/components/app/DemoProvider";
import { getConnectedWalletAddress } from "@/lib/stacks";

type PaymentLinkRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: string;
  is_universal: boolean;
  is_active: boolean;
  onchain_link_id?: string | null;
  default_currency?: Currency | null;
  default_amount?: number | null;
  metadata?: {
    pricingMode?: "fixed" | "suggested";
    suggestedAmounts?: number[];
  } | null;
  created_at: string;
};

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function PaymentLinksPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [links, setLinks] = useState<PaymentLinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setWalletAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setLinks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/payment-links?walletAddress=${encodeURIComponent(walletAddress)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Failed to load payment links.");
        }

        if (!cancelled) {
          setLinks((payload.data ?? []) as PaymentLinkRecord[]);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load payment links.");
          setLinks([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const multipayLinks = useMemo(
    () => links.filter((item) => item.kind === "multipay" && !item.is_universal),
    [links]
  );

  const copyLink = (link: PaymentLinkRecord) => {
    void navigator.clipboard.writeText(`${window.location.origin}/pay/link/${link.slug}`).then(() => {
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
    });
  };

  const rows = multipayLinks.map((link) => {
    const suggestedAmounts =
      ((link.metadata?.suggestedAmounts ?? []) as number[])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    const pricingLabel =
      suggestedAmounts.length > 0
        ? suggestedAmounts
            .map((value) => formatCurrencyAmount(value, (link.default_currency ?? "STX") as Currency))
            .join(" · ")
        : link.default_amount
          ? formatCurrencyAmount(Number(link.default_amount), (link.default_currency ?? "STX") as Currency)
          : "No amount";
    const pricingMode = suggestedAmounts.length > 0 ? "Suggested amounts" : link.default_amount ? "Fixed price" : "Open amount";
    const status = link.onchain_link_id ? (link.is_active ? "Live" : "Inactive") : "Pending";
    return { link, pricingLabel, pricingMode, status };
  });

  const createAction = (
    <Link href="/create-invoice" className="btn btn-primary w-full sm:w-auto">
      <Plus size={18} aria-hidden="true" />
      Create payment link
    </Link>
  );

  let body: ReactNode;
  if (!walletAddress) {
    body = (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true">
          <Wallet size={22} />
        </span>
        <h3>Connect a wallet to see your payment links</h3>
        <p>Payment links belong to your merchant wallet. Connect it to load every link you’ve created.</p>
      </div>
    );
  } else if (loading) {
    body = (
      <div aria-busy="true" className="divide-y divide-line">
        <span className="sr-only">Loading payment links…</span>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-6 px-5 py-5 sm:px-6" aria-hidden="true">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-56 max-w-full" />
              <div className="skeleton h-3 w-36" />
            </div>
            <div className="hidden w-40 space-y-2 lg:block">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-3 w-20" />
            </div>
            <div className="skeleton h-6 w-14 rounded-full" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="empty-state" role="alert">
        <span className="empty-state-icon text-danger" aria-hidden="true">
          <AlertCircle size={22} />
        </span>
        <h3>Couldn’t load your payment links</h3>
        <p>{error} Refresh the page to try again.</p>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true">
          <Link2 size={22} />
        </span>
        <h3>No payment links yet</h3>
        <p>
          A payment link is a reusable checkout page. Share it anywhere and customers can pay you in sBTC, STX, or
          USDCx as many times as they like. Create one by choosing MultiPay when you create an invoice.
        </p>
        <Link href="/create-invoice" className="btn btn-secondary btn-sm mt-5">
          <Plus size={16} aria-hidden="true" />
          Create your first link
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Link</th>
                <th scope="col">Pricing</th>
                <th scope="col">Currency</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ link, pricingLabel, pricingMode, status }) => (
                <tr key={link.id}>
                  <td className="max-w-[340px]">
                    <div className="truncate font-medium text-fg">{link.description || link.title}</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted">/pay/link/{link.slug}</div>
                  </td>
                  <td className="max-w-[260px]">
                    <div className="truncate tabular-nums text-fg-2">{pricingLabel}</div>
                    <div className="mt-0.5 text-sm text-muted">{pricingMode}</div>
                  </td>
                  <td className="whitespace-nowrap text-fg-2">{link.default_currency ?? "STX"}</td>
                  <td>
                    <LinkStatus status={status} />
                  </td>
                  <td className="whitespace-nowrap text-sm text-muted tabular-nums">
                    {formatCreatedAt(link.created_at)}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => copyLink(link)}
                        className="btn btn-ghost btn-sm"
                        aria-label={`Copy link for ${link.description || link.title}`}
                      >
                        {copiedId === link.id ? (
                          <Check size={16} aria-hidden="true" className="text-success" />
                        ) : (
                          <Copy size={16} aria-hidden="true" />
                        )}
                        {copiedId === link.id ? "Copied" : "Copy link"}
                      </button>
                      <Link
                        href={`/pay/link/${link.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm btn-icon !min-h-[34px] !w-[34px]"
                        aria-label={`Open ${link.description || link.title} checkout (opens in a new tab)`}
                      >
                        <ExternalLink size={16} aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line lg:hidden">
          {rows.map(({ link, pricingLabel, pricingMode, status }) => (
            <li key={link.id} className="px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{link.description || link.title}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">/pay/link/{link.slug}</p>
                </div>
                <LinkStatus status={status} />
              </div>
              <p className="mt-2 text-sm text-fg-2">
                <span className="tabular-nums">{pricingLabel}</span>
                <span className="text-muted"> · {pricingMode}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {link.default_currency ?? "STX"} · Created {formatCreatedAt(link.created_at)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyLink(link)}
                  className="btn btn-secondary"
                  aria-label={`Copy link for ${link.description || link.title}`}
                >
                  {copiedId === link.id ? (
                    <Check size={16} aria-hidden="true" className="text-success" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  {copiedId === link.id ? "Copied" : "Copy link"}
                </button>
                <Link
                  href={`/pay/link/${link.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  aria-label={`Open ${link.description || link.title} checkout (opens in a new tab)`}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Payment links"
        subtitle="Reusable checkout pages you can share again and again. Customers open the link and pay in the currency you set."
        actions={createAction}
      />

      <section className="card overflow-hidden" aria-labelledby="links-title">
        <div className="card-header !px-5 sm:!px-6">
          <div>
            <h2 id="links-title" className="card-title">MultiPay links</h2>
            <p className="card-description">
              {walletAddress && !loading && !error
                ? `${rows.length} reusable ${rows.length === 1 ? "link" : "links"}`
                : "Every MultiPay link you’ve created"}
            </p>
          </div>
        </div>
        {body}
      </section>
    </div>
  );
}

const statusTones: Record<string, string> = {
  Live: "badge-success",
  Inactive: "badge-neutral",
  Pending: "badge-warning",
};

function LinkStatus({ status }: { status: string }) {
  return (
    <span
      className={`badge shrink-0 ${statusTones[status] ?? "badge-neutral"}`}
      title={status === "Pending" ? "Waiting for the link to be confirmed on-chain" : undefined}
    >
      {status}
    </span>
  );
}
