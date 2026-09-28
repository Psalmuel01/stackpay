import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Link2,
  QrCode,
  Send,
  Check,
  ShieldCheck,
  Receipt,
  Wallet,
  BookOpen,
} from "lucide-react";

export const metadata: Metadata = {
  other: {
    "talentapp:project_verification":
      "74a5f6a08077644b438f3b69602b062aca292d19aafd2b996a5a971a52c8bc48fed8c1ccac74931dd7d03108c6d030baf093574b8cc2c0b08e641e37dbee4ce3",
  },
};

const features = [
  {
    icon: FileText,
    title: "One request. One payment.",
    description:
      "Create an invoice with an amount, asset, and expiry. Share a dedicated checkout link with your customer.",
    label: "Standard invoices",
  },
  {
    icon: Link2,
    title: "Create once. Share often.",
    description:
      "Use a reusable MultiPay link for a fixed price or suggested amounts. Track each payment separately.",
    label: "Payment links",
  },
  {
    icon: QrCode,
    title: "Your counter, connected.",
    description:
      "Give customers one QR destination. They choose the supported asset and amount at checkout.",
    label: "Universal QR",
  },
];
export default function HomePage() {
  return (
    <>
      <main id="main-content">
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute -right-40 top-0 h-[600px] w-[600px] rounded-full bg-[#fc6532]/[0.04] blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 md:py-28 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#fc6532]/25 bg-[#fc6532]/5 px-3 py-1.5 text-xs text-[#ffad91]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#fc6532]" />
                Built on Stacks · Testnet preview
              </div>
              <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl lg:text-[68px]">
                A better way to
                <br />
                get paid <span className="text-[#ff855b]">on-chain.</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/60 sm:text-lg">
                Turn a payment request into a simple checkout. Invoices,
                reusable links, and QR payments for businesses building on
                Stacks.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/dashboard" className="primary-button">
                  Launch Console <ArrowUpRight size={17} />
                </Link>
                <Link href="/docs#quickstart" className="secondary-button">
                  Read the guide <ArrowRight size={16} />
                </Link>
              </div>
              <p className="mt-5 text-xs leading-5 text-white/45">
                Connect Leather or Xverse. Sign in with your wallet.
              </p>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-white/15 bg-[#121417] p-6 shadow-[0_30px_100px_rgba(0,0,0,.35)] sm:p-8">
                <div className="flex items-center justify-between border-b border-white/10 pb-5">
                  <span className="text-sm font-medium">
                    A clear path to payment
                  </span>
                  <span className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/45">
                    How it works
                  </span>
                </div>
                <div className="space-y-7 py-7">
                  {[
                    {
                      icon: FileText,
                      title: "Create your request",
                      text: "Choose an asset, amount, and payment format.",
                    },
                    {
                      icon: Send,
                      title: "Share a checkout link",
                      text: "Your customer connects a wallet and pays.",
                    },
                    {
                      icon: Check,
                      title: "Confirm on-chain",
                      text: "Track the payment and download a receipt.",
                    },
                  ].map(({ icon: Icon, title, text }, i) => (
                    <div key={title} className="flex gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${i === 2 ? "border-[#fc6532]/25 bg-[#fc6532]/10 text-[#ff9069]" : "border-white/10 bg-white/5 text-white/60"}`}
                      >
                        <Icon size={20} />
                      </div>
                      <div>
                        <h2 className="text-sm font-medium">{title}</h2>
                        <p className="mt-1 text-sm leading-6 text-white/50">
                          {text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                  <span className="text-xs text-white/40">
                    Supported assets
                  </span>
                  <div className="flex gap-2">
                    {["STX", "sBTC", "USDCx"].map((asset) => (
                      <span
                        key={asset}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium"
                      >
                        {asset}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-xs leading-5 text-white/40">
                Payments accrue in the processor contract. Merchants withdraw
                manually.
              </p>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-24" id="product">
          <p className="text-xs font-medium uppercase tracking-[.16em] text-[#ff9069]">
            Built around your business
          </p>
          <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight md:text-4xl">
              Three ways to accept.
              <br />
              One place to manage.
            </h2>
            <p className="max-w-sm text-sm leading-6 text-white/55">
              Choose the payment experience that fits the moment, from a one-off
              invoice to your everyday checkout.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description, label }, i) => (
              <Link
                href={`/docs#${["invoices", "payment-links", "qr"][i]}`}
                key={title}
                className="group rounded-2xl border border-white/10 bg-[#111316] p-7 transition-colors hover:border-[#fc6532]/40"
              >
                <div className="mb-8 flex items-center justify-between">
                  <Icon size={25} className="text-[#ff9069]" />
                  <ArrowUpRight
                    size={18}
                    className="text-white/30 transition-colors group-hover:text-[#ff9069]"
                  />
                </div>
                <p className="text-xs text-white/45">{label}</p>
                <h3 className="mt-2 text-xl font-medium tracking-tight">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  {description}
                </p>
              </Link>
            ))}
          </div>
        </section>
        <section className="border-y border-white/10 bg-[#101114]">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:gap-20">
            <div>
              <p className="text-xs font-medium uppercase tracking-[.16em] text-[#ff9069]">
                Know where things stand
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                Payment activity.
                <br />
                With a verifiable trail.
              </h2>
              <p className="mt-5 text-sm leading-7 text-white/55">
                Follow invoices, inspect transaction references, and manage
                withdrawals from one merchant workspace. Wallet signatures
                authorize actions; confirmed chain data verifies payments.
              </p>
              <Link
                href="/docs#settlements"
                className="mt-6 inline-flex items-center gap-2 text-sm text-[#ff9069] hover:text-white"
              >
                Understand settlement <ArrowRight size={16} />
              </Link>
            </div>
            <div className="divide-y divide-white/10">
              {[
                [
                  ShieldCheck,
                  "Wallet-based sign-in",
                  "A signed challenge proves ownership before merchant data is accessible.",
                ],
                [
                  Receipt,
                  "Receipts for confirmed payments",
                  "Download a PDF with payment details and the on-chain transaction reference.",
                ],
                [
                  Wallet,
                  "Withdraw when you choose",
                  "Review your processor balance and approve a manual settlement with your wallet.",
                ],
              ].map(([Icon, title, description]) => {
                const FeatureIcon = Icon as typeof Wallet;
                return (
                  <div
                    key={String(title)}
                    className="flex gap-4 py-6 first:pt-0 last:pb-0"
                  >
                    <FeatureIcon
                      size={21}
                      className="mt-1 shrink-0 text-white/60"
                    />
                    <div>
                      <h3 className="font-medium">{String(title)}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/55">
                        {String(description)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <div className="flex flex-col justify-between gap-8 rounded-2xl border border-[#fc6532]/20 bg-gradient-to-br from-[#fc6532]/[0.07] to-transparent p-8 sm:p-12 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-medium text-[#ff9069]">
                Start with a test payment
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Get familiar before you go live.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">
                StackPay is a testnet preview. Read the setup guide, explore the
                payment flows, and review the current limitations before
                integrating.
              </p>
            </div>
            <Link href="/docs" className="secondary-button shrink-0">
              Explore documentation <BookOpen size={17} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
