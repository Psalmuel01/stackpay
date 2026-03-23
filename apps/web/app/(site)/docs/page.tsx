"use client";

import { useMemo, useState } from "react";
import Footer from "@/components/Footer";
import GlassCard from "@/components/GlassCard";

const sections = [
  "Overview",
  "Guides",
  "SDK",
  "Smart Contracts",
  "Frontend Logic",
  "Backend API"
] as const;

type Section = (typeof sections)[number];

const overviewStats = [
  { label: "Supported assets", value: "sBTC · STX · USDCx" },
  { label: "Checkout modes", value: "Standard · MultiPay · Universal QR" },
  { label: "Notifications", value: "Chainhook-powered · In-app" },
  { label: "Settlement", value: "Manual withdrawal · MVP" }
];

const guideCards = [
  {
    title: "Standard invoice",
    body:
      "A single-use payment request. The merchant specifies amount, currency, customer details, and expiry. The invoice closes permanently once payment is confirmed on-chain. Suitable for one-off transactions and bespoke payment requests."
  },
  {
    title: "MultiPay",
    body:
      "A reusable product-style payment route. The merchant configures a fixed price or a set of suggested amounts once — the route remains active indefinitely. Each payment generates a fresh on-chain invoice underneath, keeping every transaction independently traceable."
  },
  {
    title: "Universal QR",
    body:
      "A permanent public payment endpoint with no amount constraint. The customer selects the asset and amount at checkout. Designed for real-world acceptance: counters, events, tips, and open-ended collections where the merchant needs one stable destination."
  },
  {
    title: "Receipts",
    body:
      "Every confirmed payment can produce a downloadable PDF receipt containing the merchant identity, invoice reference, on-chain transaction ID, payer wallet, and payment metadata — providing a verifiable paper trail for both parties."
  }
];

const sdkItems = [
  {
    label: "Current status",
    value:
      "The @stackpay/sdk package exists as a foundation layer, but the primary integration surface today is the Next.js application and its route handlers. Direct SDK consumption is not yet the recommended path."
  },
  {
    label: "Recommended integration path",
    value:
      "Integrate via the existing API routes and hosted checkout pages. The SDK will be formalised once the backend surface stabilises and the core payment flows are production-hardened."
  },
  {
    label: "Planned SDK scope",
    value:
      "Invoice creation and confirmation, payment-link management, receipt retrieval, notification subscription hooks, and merchant settlement actions."
  }
];

const contractItems = [
  {
    title: "Architecture contract",
    body:
      "The canonical source of invoice and payment-link state. This contract is responsible for issuing invoice IDs, governing reusable-route behaviour, and emitting the invoice-paid event that drives the notification pipeline downstream."
  },
  {
    title: "Processor contract",
    body:
      "Handles payment execution, maintains merchant balances held in escrow within the processor, and authorises settlement withdrawals back to the merchant wallet when requested."
  },
  {
    title: "What lives on-chain",
    body:
      "Invoice IDs, payment state, receipt IDs, merchant processor balances, and settlement execution records. These are the authoritative payment facts the application synchronises from."
  },
  {
    title: "What stays off-chain",
    body:
      "Merchant profile metadata, dashboard records, activity feeds, notification rows, PDF receipts, and operational state are stored in Supabase and should never be treated as the payment source of truth."
  }
];

const frontendItems = [
  {
    title: "Merchant identity",
    body:
      "Merchant accounts are anchored to the connected Stacks wallet. Display name, business name, email, public slug, and settlement wallet preference are managed through the profile setup flow and persisted in Supabase."
  },
  {
    title: "Chain-first writes",
    body:
      "No invoice is stored before it exists on-chain. The merchant signs the contract call, the application confirms the transaction against the chain, and only after successful confirmation does the Supabase record get created."
  },
  {
    title: "Hosted payment pages",
    body:
      "Customer-facing checkout pages are live for standard invoices and payment links. Pages handle all meaningful states — loading, awaiting payment, paid, and expired — rather than silently failing or showing empty views."
  },
  {
    title: "Dashboard integrity",
    body:
      "All dashboard metrics are derived from real invoice, receipt, payment-link, and notification data. There are no hardcoded demo values — what the merchant sees reflects the actual state of their account."
  }
];

const backendRoutes = [
  "GET  /api/merchant/profile",
  "POST /api/merchant/profile",
  "GET  /api/invoices",
  "POST /api/invoices",
  "POST /api/invoices/confirm",
  "GET  /api/invoices/[invoiceId]",
  "POST /api/invoices/[invoiceId]/payment",
  "GET  /api/payment-links",
  "POST /api/payment-links",
  "POST /api/payment-links/[paymentLinkId]/chain",
  "GET  /api/payment-links/public/[slug]",
  "POST /api/payment-links/public/[slug]/invoices",
  "POST /api/payment-links/public/[slug]/invoices/confirm",
  "GET  /api/qr-link",
  "POST /api/qr-link",
  "GET  /api/notifications",
  "PATCH /api/notifications",
  "GET  /api/settlements",
  "POST /api/settlements",
  "POST /api/settlements/confirm",
  "POST /api/webhooks/chainhooks",
  "GET  /api/receipts/[receiptId]/pdf"
];

const content: Record<Section, { intro: string; body: JSX.Element }> = {
  Overview: {
    intro:
      "StackPay is a chain-first payment product built on Stacks. The current MVP covers merchant onboarding, invoice creation, reusable payment links, hosted customer checkout, PDF receipts, in-app notifications, and manual settlement — all running against real contracts on testnet.",
    body: (
      <div className="space-y-3">
        <p className="leading-6">
          The product is structured around three distinct payment surfaces:{" "}
          <span className="text-white">Standard invoices</span> for single-use payment requests,{" "}
          <span className="text-white">MultiPay</span> for reusable product-style routes, and{" "}
          <span className="text-white">Universal QR</span> for open-ended public payments where the customer determines the amount. Each surface creates verifiable on-chain records while the merchant-facing layer remains in Supabase.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {overviewStats.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">{item.label}</div>
              <div className="mt-2 text-sm text-white/75">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.3em] text-white/40">Architectural separation</div>
          <div className="mt-2 text-sm leading-6 text-white/70">
            Clarity contracts hold payment truth — invoice IDs, payment state, receipt IDs, and settlement execution. Supabase stores the merchant-facing product layer — profiles, dashboard records, notifications, and operational metadata. The Next.js application coordinates both sides through route handlers, hosted pages, wallet orchestration, and Chainhook webhook ingestion.
          </div>
        </div>
      </div>
    )
  },
  Guides: {
    intro:
      "These are the four core merchant flows in the current MVP. Each solves a distinct payment problem and is intentionally kept separate at the product, contract, and data levels.",
    body: (
      <div className="grid gap-4 md:grid-cols-2">
        {guideCards.map((card) => (
          <div key={card.title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="text-sm font-semibold text-white">{card.title}</div>
            <div className="mt-2 text-sm leading-6 text-white/65">{card.body}</div>
          </div>
        ))}
      </div>
    )
  },
  SDK: {
    intro:
      "The SDK is in early groundwork stage. The stable and recommended integration path today is through the Next.js application and its route handlers — not the external package. This section documents current status honestly and outlines the intended direction.",
    body: (
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white/70">
          npm install @stackpay/sdk
        </div>
        <div className="space-y-3">
          {sdkItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">{item.label}</div>
              <div className="mt-2 text-sm leading-6 text-white/65">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  "Smart Contracts": {
    intro:
      "StackPay anchors payment truth on-chain. Invoice creation, payment state transitions, receipt IDs, processor balances, and settlement execution are all contract-owned — not derived from the database.",
    body: (
      <div className="grid gap-4 md:grid-cols-2">
        {contractItems.map((item) => (
          <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="text-sm font-semibold text-white">{item.title}</div>
            <div className="mt-2 text-sm leading-6 text-white/65">{item.body}</div>
          </div>
        ))}
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 md:col-span-2">
          <div className="text-xs uppercase tracking-[0.3em] text-white/40">Event surface</div>
          <div className="mt-2 text-sm leading-6 text-white/65">
            The notification pipeline currently depends on the{" "}
            <span className="font-mono text-xs text-white/80">invoice-paid</span> event emitted by the architecture contract and delivered via Hiro Chainhook. The processor contract also emits a settlement event on withdrawal, which can be folded into the same webhook flow to produce a unified operational event stream as the product matures.
          </div>
        </div>
      </div>
    )
  },
  "Frontend Logic": {
    intro:
      "The frontend coordinates real wallet interactions, on-chain confirmation flows, hosted customer checkout, and merchant dashboard data. It is not a static prototype — every view reflects live contract and database state.",
    body: (
      <div className="grid gap-4 md:grid-cols-2">
        {frontendItems.map((item) => (
          <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="text-sm font-semibold text-white">{item.title}</div>
            <div className="mt-2 text-sm leading-6 text-white/65">{item.body}</div>
          </div>
        ))}
      </div>
    )
  },
  "Backend API": {
    intro:
      "The active backend is the Next.js route layer located at apps/web/app/api. These handlers power merchant profile management, invoice and payment-link flows, notifications, receipt generation, settlement, and the Chainhook webhook endpoint.",
    body: (
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white/70">
          Base path: apps/web/app/api/*
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {backendRoutes.map((route) => (
            <div key={route} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-white/65">
              {route}
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.3em] text-white/40">Next priorities</div>
          <div className="mt-2 text-sm leading-6 text-white/65">
            Merchant email notifications routed through the existing Chainhook pipeline, reduced polling in favour of realtime Supabase subscriptions, production hardening for remote database connectivity, and deeper subscription-billing support once the core payment surfaces stabilise.
          </div>
        </div>
      </div>
    )
  }
};

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<Section>("Overview");
  const activeContent = useMemo(() => content[activeSection], [activeSection]);

  return (
    <div className="flex min-h-screen flex-col pt-10">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-12">
        <div className="mb-12 space-y-3 md:mb-14">
          <span className="text-xs uppercase tracking-[0.4em] text-white/40">Docs</span>
          <h1 className="text-4xl font-semibold md:text-5xl">Technical Documentation</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-white/55 md:text-base">
            A comprehensive reference for StackPay&apos;s current MVP — covering on-chain invoice flows, payment surfaces, contract architecture, API routes, and the notification and settlement pipeline.
          </p>
        </div>

        <GlassCard className="flex-1 rounded-3xl p-7 md:p-8">
          <div className="mb-7 flex flex-wrap gap-2.5">
            {sections.map((section) => {
              const isActive = section === activeSection;
              return (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`rounded-full px-4 py-2.5 text-xs transition ${isActive
                      ? "border border-white/20 bg-white text-black"
                      : "border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white"
                    }`}
                >
                  {section}
                </button>
              );
            })}
          </div>

          <div className="space-y-6 text-sm text-white/70">
            <p className="leading-6 text-white/60">{activeContent.intro}</p>
            {activeContent.body}
          </div>
        </GlassCard>
      </div>
      <Footer />
    </div>
  );
}
