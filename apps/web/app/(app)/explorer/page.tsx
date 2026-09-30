"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileSearch, Search } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import {
  formatCurrencyAmount,
  formatDateTime,
  useDemo,
} from "@/components/app/DemoProvider";

export default function ExplorerPage() {
  const { state } = useDemo();
  const [query, setQuery] = useState(state.invoices[0]?.id ?? "");

  const invoice = state.invoices.find(
    (item) =>
      item.id.toLowerCase() === query.toLowerCase() ||
      item.receiptId?.toLowerCase() === query.toLowerCase()
  );
  const receipt = state.receipts.find(
    (item) =>
      item.id.toLowerCase() === query.toLowerCase() ||
      item.invoiceId.toLowerCase() === query.toLowerCase()
  );
  const paymentLink = state.paymentLinks.find((item) => item.slug.toLowerCase() === query.toLowerCase());

  const details: string[][] | null = invoice
    ? [
      ["Merchant", state.merchant.businessName],
      ["Amount", formatCurrencyAmount(invoice.amount, invoice.currency)],
      ["Created", formatDateTime(invoice.createdAt)],
      ["Receipt", invoice.receiptId || "Pending"],
    ]
    : receipt
      ? [
        ["Receipt", receipt.id],
        ["Invoice", receipt.invoiceId],
        ["Amount", formatCurrencyAmount(receipt.amount, receipt.currency)],
        ["Timestamp", formatDateTime(receipt.timestamp)],
      ]
      : paymentLink
        ? [
          ["Slug", paymentLink.slug],
          ["Mode", paymentLink.mode],
          ["Currency", paymentLink.currency],
          ["Created", formatDateTime(paymentLink.createdAt)],
        ]
        : null;

  const timeline = invoice
    ? [
      "Invoice created and indexed",
      invoice.status === "paid" ? "Customer payment received" : "Waiting on customer payment",
      invoice.receiptId ? "Receipt attached and webhook delivered" : "Receipt will appear after payment",
    ]
    : paymentLink
      ? [
        "Reusable MultiPay route created",
        "Hosted route resolves merchant mode",
        "Link can create or resolve invoice state",
      ]
      : [
        "Search by invoice id",
        "Search by receipt id",
        "Search by MultiPay route slug",
      ];

  const matchLabel = invoice?.id || receipt?.id || paymentLink?.slug;
  const matchKind = invoice ? "Invoice" : receipt ? "Receipt" : paymentLink ? "MultiPay route" : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Explorer"
        subtitle="Look up an invoice, receipt, or MultiPay route to check its status. Results here come from sample data."
      />

      <section className="card p-5 sm:p-6">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="relative min-w-0 flex-1">
            <label htmlFor="explorer-query" className="sr-only">Invoice, receipt, or payment link</label>
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="explorer-query"
              className="field pl-11 font-mono"
              placeholder="Invoice id, receipt id, or payment link slug"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full sm:w-auto">
            Verify
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[14px] text-muted">Try an example:</span>
          <button type="button" onClick={() => setQuery(state.invoices[0]?.id ?? "")} className="chip">
            Invoice
          </button>
          <button type="button" onClick={() => setQuery(state.receipts[0]?.id ?? "")} className="chip">
            Receipt
          </button>
          <button type="button" onClick={() => setQuery(state.paymentLinks[0]?.slug ?? "")} className="chip">
            Payment link
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden" aria-live="polite">
          <div className="card-header">
            <div className="min-w-0">
              <p className="text-[14px] text-muted">{matchKind ?? "Result"}</p>
              <h2 className="mt-0.5 break-all font-mono text-lg font-semibold text-fg">
                {matchLabel || "No match yet"}
              </h2>
            </div>
            <StatusBadge
              className="shrink-0"
              label={
                invoice?.status === "paid"
                  ? "Settled"
                  : invoice?.status === "pending"
                    ? "Pending"
                    : receipt
                      ? "Settled"
                      : paymentLink
                        ? "Active"
                        : "Draft"
              }
            />
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {details ? (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label} className="min-w-0 border-b border-line pb-3.5">
                    <dt className="text-[14px] text-muted">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium tabular-nums text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="empty-state py-6">
                <div className="empty-state-icon">
                  <FileSearch size={22} aria-hidden="true" />
                </div>
                <h3>Nothing matches that search</h3>
                <p>Paste a full invoice id, receipt id, or payment link slug, or pick one of the examples above.</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-fg">{details ? "Timeline" : "What you can search"}</h3>
              <ol className="mt-3 space-y-4">
                {timeline.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong bg-subtle text-xs font-semibold tabular-nums text-fg-2"
                    >
                      {index + 1}
                    </span>
                    <span className="pt-px text-sm text-fg-2">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Network snapshot</h2>
            </div>
            <dl className="divide-y divide-line">
              {[
                ["Total invoices", `${state.invoices.length}`],
                ["Active merchants", "1 demo merchant"],
                ["Settlements", `${state.settlementRuns.length}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <div>
                <h2 className="card-title">Public activity</h2>
                <p className="card-description">The latest invoices anyone can verify.</p>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {state.invoices.slice(0, 3).map((item) => (
                <li key={item.id} className="px-5 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[14px] font-medium text-fg">{item.id}</p>
                      <p className="mt-0.5 text-[14px] text-muted">
                        {item.customer} · <span className="tabular-nums">{formatCurrencyAmount(item.amount, item.currency)}</span>
                      </p>
                    </div>
                    <StatusBadge
                      className="shrink-0"
                      label={
                        item.status === "paid"
                          ? "Settled"
                          : item.status === "pending"
                            ? "Pending"
                            : item.status === "expired"
                              ? "Expired"
                              : "Draft"
                      }
                    />
                  </div>
                  <Link href={`/pay/${item.id}`} className="link mt-2 inline-flex items-center gap-1 text-[14px]">
                    Open checkout
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
