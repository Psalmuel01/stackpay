import type { Metadata } from "next";
import Footer from "@/components/Footer";
import { ArrowRight, BadgeCheck, Globe, Lock, Sparkles, Workflow } from "lucide-react";
import { supportedCurrencies } from "@stackpay/domain";
import Link from "next/link";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  other: {
    "talentapp:project_verification":
      "74a5f6a08077644b438f3b69602b062aca292d19aafd2b996a5a971a52c8bc48fed8c1ccac74931dd7d03108c6d030baf093574b8cc2c0b08e641e37dbee4ce3"
  }
};

const ParticleSphere = dynamic(() => import("@/components/ParticleSphere"), { ssr: false });

const featureGrid = [
  {
    title: "On-chain Invoices",
    description: "Create verifiable invoices that settle directly to merchant wallets with full control of funds.",
    icon: BadgeCheck
  },
  {
    title: "Subscriptions",
    description: "Set recurring billing with automated collection and smart retry logic.",
    icon: Workflow
  },
  {
    title: "Smart Settlements",
    description: "Threshold or scheduled payouts across multiple wallets with audit trails.",
    icon: Sparkles
  },
  {
    title: "Developer Tools",
    description: "REST APIs, SDKs, webhooks, and instant sandbox environments.",
    icon: Globe
  },
  {
    title: "Non-custodial",
    description: "No lockups. Merchants hold keys and settle on-chain instantly.",
    icon: Lock
  },
  {
    title: "Bitcoin-native",
    description: "Built on Stacks with support for sBTC, STX, and USDCx payments.",
    icon: BadgeCheck
  }
];

const steps = [
  {
    title: "Create Invoice",
    description:
      "Choose Standard, Subscription, or Donation. Set amount, currency, and expiration in seconds."
  },
  {
    title: "Share Payment Link",
    description:
      "Send a hosted invoice link with QR code. Customers pay with any Stacks wallet."
  },
  {
    title: "Settle Automatically",
    description:
      "Funds move on-chain to your wallets with configurable settlement rules and alerts."
  }
];

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen">
      <main className="relative overflow-hidden">
        <section className="fade-section relative section-pad pb-28">
          <ParticleSphere />
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/60">
                <span className="accent-dot text-[11px]">Bitcoin-native payment gateway</span>
              </div>
              <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl">
                Payments on Stacks without <span className="accent-underline">borders</span>.
              </h1>
              <p className="text-base text-white/60 md:text-lg">
                Accept sBTC, STX, and USDCx anywhere in the world — on-chain invoices, subscriptions, and instant settlements with full custody.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="button-glow inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
                >
                  Get Started <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="button-glow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Documentation
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.3em] text-white/40">
                <span className="accent-">On-chain invoices</span>
                <span className="accent-">Live webhooks</span>
                <span className="accent-">Non-custodial</span>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="fade-section section-pad">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="mb-10 flex flex-col gap-4">
              <span className="text-xs uppercase tracking-[0.4em] text-white/40">Core product</span>
              <h2 className="text-3xl font-semibold md:text-4xl">
                Everything you need to run <span className="text-accent">Bitcoin-native</span> payments.
              </h2>
              <p className="max-w-2xl text-sm text-white/60 md:text-base">
                StackPay delivers on-chain invoices, recurring billing, and automated settlement infrastructure built for modern businesses.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {featureGrid.map((feature, index) => {
                const Icon = feature.icon;
                const accent = index === 2 || index === 4;
                return (
                  <div
                    key={feature.title}
                    className={`glass group rounded-2xl p-6 transition hover:border-white/30 ${accent ? "border-white/30" : ""
                      }`}
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5">
                      <Icon className={`h-5 w-5 ${accent ? "text-accent" : "text-white/70"}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-sm text-white/60">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="fade-section section-pad pt-10">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-[0.4em] text-white/40">How it works</span>
                <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Three steps to settlement.</h2>
              </div>
              <span className="hidden text-sm text-white/40 md:block">Invoices · Links · On-chain receipts</span>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {steps.map((step, idx) => (
                <div key={step.title} className="glass rounded-2xl p-6">
                  <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold text-white/70">
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-white/60">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="fade-section section-pad">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="glass rounded-3xl p-10">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="text-xs uppercase tracking-[0.4em] text-white/40">Supported currencies</span>
                  <h2 className="mt-3 text-3xl font-semibold">sBTC, STX, and USDCx</h2>
                  <p className="mt-3 text-sm text-white/60">
                    Accept Bitcoin-native assets and stable settlement options on Stacks without building bespoke infrastructure.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {supportedCurrencies.map((token, idx) => (
                    <div
                      key={token.symbol}
                      className={`glass-strong rounded-2xl px-6 py-4 ${idx === 2 ? "border border-white/30" : ""
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${token.tone}`} />
                        <span className="text-lg font-semibold">{token.symbol}</span>
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/50">
                        {token.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="developers" className="fade-section section-pad">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <span className="text-xs uppercase tracking-[0.4em] text-white/40">Developer tools</span>
                <h2 className="text-3xl font-semibold md:text-4xl">API-first stack for modern payment flows.</h2>
                <p className="text-sm text-white/60 md:text-base">
                  Build invoices, subscriptions, and settlements with a unified REST API, secure webhooks, and SDKs for every stack.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    "API keys & roles",
                    "Webhook signatures",
                    "Invoice lifecycle events",
                    "SDKs for JS/TS"
                  ].map((item, idx) => (
                    <div
                      key={item}
                      className={`glass rounded-xl px-4 py-3 text-sm text-white/70 ${idx === 1 ? "border border-white/30" : ""
                        }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass rounded-2xl p-5 font-mono text-[11px] text-white/70">
                <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                  <span>Quick start</span>
                  <span className="text-accent">stackpay sdk</span>
                </div>
                <pre className="whitespace-pre-wrap leading-5">
                  {`npm install @stackpay/sdk\n\nimport { StackPay } from "@stackpay/sdk";\n\nconst client = new StackPay({ apiKey: process.env.STACKPAY_API_KEY });\n\nconst invoice = await client.invoices.create({\n  type: "standard",\n  currency: "sBTC",\n  amount: 0.018,\n  description: "April subscription",\n});`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section id="docs" className="fade-section section-pad pt-4">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="glass rounded-3xl p-10">
              <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="text-xs uppercase tracking-[0.4em] text-white/40">Docs & guides</span>
                  <h2 className="mt-3 text-3xl font-semibold">
                    Design for merchants. Built for <span className="text-accent">developers</span>.
                  </h2>
                  <p className="mt-3 max-w-xl text-sm text-white/60">
                    Launch production-ready payment flows with comprehensive references, SDK examples, and live webhooks.
                  </p>
                </div>
                <Link
                  href="/docs"
                  className="button-glow inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
                >
                  Explore Docs <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
