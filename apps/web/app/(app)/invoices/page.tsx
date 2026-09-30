"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, FileText, Plus, Search, SearchX, Wallet } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import { formatCurrencyAmount, formatDateTime } from "@/lib/format";
import { getConnectedWalletAddress } from "@/lib/stacks";

type Filter = "all" | "pending" | "paid" | "expired";

type RemoteInvoice = {
  /** Stable id (inv_…); the only id an API draft has until checkout. */
  public_id: string;
  onchain_invoice_id: string | null;
  status: "draft" | "pending" | "paid" | "expired" | "canceled";
  amount: number;
  currency: "sBTC" | "STX" | "USDCx";
  description: string;
  customer_name: string;
  customer_email: string;
  expires_at: string | null;
  paid_at: string | null;
  created_at?: string | null;
};

function getEffectiveStatus(invoice: RemoteInvoice, nowMs: number) {
  if (invoice.status !== "pending" && invoice.status !== "draft") {
    return invoice.status;
  }

  const expiresAtMs = invoice.expires_at ? Date.parse(invoice.expires_at) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return "expired";
  }

  return invoice.status;
}

export default function InvoicesPage() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [remoteInvoices, setRemoteInvoices] = useState<RemoteInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setRemoteInvoices([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/invoices?walletAddress=${encodeURIComponent(connectedAddress)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return [];
        }

        const payload = await response.json();
        return (payload.data ?? []) as RemoteInvoice[];
      })
      .then((rows) => {
        if (!cancelled) {
          setRemoteInvoices(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteInvoices([]);
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
  }, [connectedAddress]);

  const invoices = useMemo(() => {
    return remoteInvoices
      .map((invoice) => {
        const effectiveStatus = getEffectiveStatus(invoice, nowMs);
        return {
          ...invoice,
          effectiveStatus,
        };
      })
      .filter((invoice) => {
        const matchesFilter = filter === "all" ? true : invoice.effectiveStatus === filter;
        const haystack = [
          invoice.onchain_invoice_id,
          invoice.public_id,
          invoice.customer_name,
          invoice.customer_email,
          String(invoice.amount),
          invoice.currency,
          invoice.description,
        ]
          .join(" ")
          .toLowerCase();
        return matchesFilter && haystack.includes(query.toLowerCase());
      });
  }, [filter, nowMs, query, remoteInvoices]);

  const statusCounts = useMemo(() => {
    const counts: Record<Filter, number> = { all: remoteInvoices.length, pending: 0, paid: 0, expired: 0 };
    for (const invoice of remoteInvoices) {
      counts[getEffectiveStatus(invoice, nowMs) as Filter] += 1;
    }
    return counts;
  }, [nowMs, remoteInvoices]);

  const hasQuery = query.trim().length > 0;
  const clearFilters = () => {
    setFilter("all");
    setQuery("");
  };

  let body: ReactNode;
  if (!connectedAddress) {
    body = (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true">
          <Wallet size={22} />
        </span>
        <h3>Connect a wallet to see your invoices</h3>
        <p>Invoices are stored against your merchant wallet. Connect it to load every invoice you have issued.</p>
      </div>
    );
  } else if (loading && remoteInvoices.length === 0) {
    body = (
      <div aria-busy="true" className="divide-y divide-line">
        <span className="sr-only">Loading invoices…</span>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-6 px-4 py-5 sm:px-6" aria-hidden="true">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-48 max-w-full" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="hidden flex-1 space-y-2 lg:block">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3 w-40" />
            </div>
            <div className="skeleton h-4 w-20" />
            <div className="skeleton hidden h-6 w-16 rounded-full sm:block" />
          </div>
        ))}
      </div>
    );
  } else if (remoteInvoices.length === 0) {
    body = (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true">
          <FileText size={22} />
        </span>
        <h3>No invoices yet</h3>
        <p>Create an invoice and share its checkout link. Each invoice and its payment status will appear here.</p>
        <Link href="/create-invoice" className="btn btn-secondary btn-sm mt-5">
          <Plus size={16} aria-hidden="true" />
          Create your first invoice
        </Link>
      </div>
    );
  } else if (invoices.length === 0) {
    const filterLabel = filterOptions.find((option) => option.value === filter)?.label.toLowerCase();
    body = (
      <div className="empty-state" role="status">
        <span className="empty-state-icon" aria-hidden="true">
          <SearchX size={22} />
        </span>
        <h3>No matching invoices</h3>
        <p>
          {hasQuery
            ? <>Nothing {filter === "all" ? "" : `${filterLabel} `}matches “{query.trim()}”. Try a customer name, email, amount, or invoice ID.</>
            : <>You don’t have any {filterLabel} invoices right now.</>}
        </p>
        <button type="button" onClick={clearFilters} className="btn btn-secondary btn-sm mt-5">
          {hasQuery && filter !== "all" ? "Clear search and filter" : hasQuery ? "Clear search" : "Show all invoices"}
        </button>
      </div>
    );
  } else {
    body = (
      <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Customer</th>
                <th scope="col" className="text-right">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Due / paid</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const timeline = getTimeline(invoice);
                return (
                  <tr key={invoice.public_id}>
                    <td className="max-w-[320px]">
                      <div className="truncate font-medium text-fg">
                        {invoice.description || "Untitled invoice"}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted">
                        {invoice.onchain_invoice_id ?? invoice.public_id}
                      </div>
                    </td>
                    <td className="max-w-[240px]">
                      <div className="truncate text-fg-2">{invoice.customer_name || "No name"}</div>
                      <div className="mt-0.5 truncate text-sm text-muted">
                        {invoice.customer_email || "No email"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                      {formatCurrencyAmount(Number(invoice.amount), invoice.currency)}
                    </td>
                    <td>
                      <StatusBadge label={statusLabel(invoice.effectiveStatus)} />
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-sm text-muted">{timeline.label}</div>
                      <div className="text-fg-2 tabular-nums">{timeline.value}</div>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/pay/${invoice.onchain_invoice_id ?? invoice.public_id}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open checkout for ${invoice.onchain_invoice_id ?? invoice.public_id} (opens in a new tab)`}
                        className="btn btn-ghost btn-sm"
                      >
                        Open checkout
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line lg:hidden">
          {invoices.map((invoice) => {
            const timeline = getTimeline(invoice);
            return (
              <li key={invoice.public_id} className="px-4 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{invoice.description || "Untitled invoice"}</p>
                    <p className="mt-0.5 truncate text-sm text-muted">
                      <span className="font-mono text-xs">{invoice.onchain_invoice_id ?? invoice.public_id}</span>
                      {" · "}
                      {invoice.customer_name || invoice.customer_email || "No customer"}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-medium tabular-nums text-fg">
                    {formatCurrencyAmount(Number(invoice.amount), invoice.currency)}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StatusBadge label={statusLabel(invoice.effectiveStatus)} />
                    <span className="truncate text-sm text-muted tabular-nums">
                      {invoice.effectiveStatus === "pending" ? `${timeline.label} ${timeline.value}` : timeline.value}
                    </span>
                  </div>
                  <Link
                    href={`/pay/${invoice.onchain_invoice_id ?? invoice.public_id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open checkout for ${invoice.onchain_invoice_id ?? invoice.public_id} (opens in a new tab)`}
                    className="btn btn-secondary btn-icon shrink-0"
                  >
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Every invoice issued from your connected wallet, and whether it’s been paid."
        actions={
          <>
            <a href="/api/exports/reconciliation" download className="btn btn-secondary w-full sm:w-auto">
              <Download size={18} aria-hidden="true" />
              Export CSV
            </a>
            <Link href="/create-invoice" className="btn btn-primary w-full sm:w-auto">
              <Plus size={18} aria-hidden="true" />
              Create invoice
            </Link>
          </>
        }
      />

      <section className="card overflow-hidden" aria-label="Invoice list">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="segmented flex w-full flex-nowrap lg:w-auto" role="group" aria-label="Filter by status">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className="flex-1 !px-2 sm:!px-3.5 lg:flex-none"
              >
                {option.label}
                {connectedAddress && remoteInvoices.length > 0 && (
                  <span className="hidden tabular-nums text-muted sm:inline">{statusCounts[option.value]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-80">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              className="field pl-10"
              placeholder="Search customer, amount, or ID"
              aria-label="Search invoices"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {body}
      </section>
    </div>
  );
}

const filterOptions: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "expired", label: "Expired" },
];

function statusLabel(status: string) {
  return ({ paid: "Paid", expired: "Expired", draft: "Draft", canceled: "Canceled" } as Record<string, string>)[status] ?? "Pending";
}

function getTimeline(invoice: RemoteInvoice & { effectiveStatus: string }) {
  if (invoice.effectiveStatus === "paid") {
    return { label: "Paid", value: formatDateTime(invoice.paid_at) };
  }
  if (!invoice.expires_at) {
    return { label: "Due", value: "No expiry" };
  }
  return {
    label: invoice.effectiveStatus === "expired" ? "Expired" : "Expires",
    value: formatDateTime(invoice.expires_at),
  };
}
