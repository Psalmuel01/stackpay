import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import TokenLogo from "@/components/TokenLogo";
import { FadeIn, StaggerContainer, StaggerItem, HoverCard } from "@/components/Motion";
import { CheckoutStory, HeroCoins, PaymentPops, PaymentTicker } from "@/components/landing/LandingMotion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  LayoutGrid,
  Link2,
  QrCode,
  Receipt,
  ShieldCheck,
  Wallet,
  ArrowDownToLine,
} from "lucide-react";

export const metadata: Metadata = {
  other: {
    "talentapp:project_verification":
      "74a5f6a08077644b438f3b69602b062aca292d19aafd2b996a5a971a52c8bc48fed8c1ccac74931dd7d03108c6d030baf093574b8cc2c0b08e641e37dbee4ce3",
  },
};

/* --------------------------------------------------------------------------
   Content
   -------------------------------------------------------------------------- */

const assets = [
  { name: "sBTC", description: "Bitcoin, usable on Stacks" },
  { name: "STX", description: "The native Stacks token" },
  { name: "USDCx", description: "Dollar-backed stablecoin" },
] as const;

const steps = [
  {
    title: "Create a request",
    text: "Pick an asset, set the amount and expiry, and confirm in your wallet.",
  },
  {
    title: "Share the checkout",
    text: "Send the link or show the QR code. Your customer connects a wallet and pays.",
  },
  {
    title: "Get a verified receipt",
    text: "Once the payment confirms on-chain, download a PDF receipt with the transaction reference.",
  },
];

const trust = [
  {
    icon: ShieldCheck,
    title: "Wallet-based sign-in",
    text: "A signed challenge proves you own the wallet before any merchant data is shown.",
  },
  {
    icon: Receipt,
    title: "Receipts for confirmed payments",
    text: "Each receipt includes the payment details and its on-chain transaction reference.",
  },
  {
    icon: Wallet,
    title: "Withdraw when you choose",
    text: "Payments collect in the processor contract. You approve every withdrawal from your wallet.",
  },
];

/* --------------------------------------------------------------------------
   Small presentational pieces (decorative product fragments)
   -------------------------------------------------------------------------- */

function AssetMark({ index, size = 24 }: { index: 0 | 1 | 2; size?: number }) {
  return <TokenLogo token={assets[index].name} size={size} />;
}

// A deterministic QR-like pattern with the three finder squares.
const QR_SIZE = 21;
const qrCells: boolean[] = Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
  const x = i % QR_SIZE;
  const y = Math.floor(i / QR_SIZE);
  const inFinder = (fx: number, fy: number) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7;
  const finder = (fx: number, fy: number) => {
    const dx = x - fx;
    const dy = y - fy;
    const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6;
    const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
    return edge || core;
  };
  if (inFinder(0, 0)) return finder(0, 0);
  if (inFinder(QR_SIZE - 7, 0)) return finder(QR_SIZE - 7, 0);
  if (inFinder(0, QR_SIZE - 7)) return finder(0, QR_SIZE - 7);
  if ((x === 7 || y === 7) && (x < 8 && y < 8)) return false;
  if (x === 7 && y > QR_SIZE - 9) return false;
  if (y === 7 && x > QR_SIZE - 9) return false;
  return ((x * 7 + y * 13 + x * y * 3) % 5) < 2;
});

function QrTile({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`}
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect x={-1} y={-1} width={QR_SIZE + 2} height={QR_SIZE + 2} rx={1.5} className="fill-fg" />
      {qrCells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={i % QR_SIZE}
            y={Math.floor(i / QR_SIZE)}
            width={1}
            height={1}
            className="fill-canvas"
          />
        ) : null,
      )}
    </svg>
  );
}

function MiniRow({
  title,
  meta,
  status,
  amount,
  asset,
}: {
  title: string;
  meta: string;
  status: "Paid" | "Pending";
  amount: string;
  asset: 0 | 1 | 2;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-subtle text-muted">
        <FileText size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{title}</p>
        <p className="truncate text-xs text-muted">{meta}</p>
      </div>
      <span className={`badge ${status === "Paid" ? "badge-success" : "badge-warning"} hidden md:inline-flex`}>
        {status}
      </span>
      <span className="hidden w-32 items-center justify-end gap-2 text-sm font-medium tabular-nums text-fg lg:flex">
        <AssetMark index={asset} size={18} />
        {amount}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Hero product visual
   -------------------------------------------------------------------------- */

function ProductStage() {
  return (
    <div className="relative mx-auto mb-8 mt-14 max-w-5xl sm:mb-0 sm:mt-20" aria-hidden="true">

      {/* Console window */}
      <div className="relative hidden overflow-hidden rounded-card border border-line-strong bg-canvas shadow-pop sm:mr-[140px] sm:block lg:mr-[250px]">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3 text-sm">
            <Logo size={24} wordmark={false} />
            <span className="text-muted">Console</span>
            <span className="text-line-strong">/</span>
            <span className="font-medium text-fg">Invoices</span>
          </div>
          <span className="badge badge-warning">Testnet</span>
        </div>
        <div className="flex">
          <div className="hidden w-44 shrink-0 space-y-1 border-r border-line p-3 lg:block">
            {[
              [LayoutGrid, "Overview"],
              [FileText, "Invoices"],
              [Link2, "Payment links"],
              [QrCode, "Universal QR"],
              [ArrowDownToLine, "Settlements"],
            ].map(([Icon, label]) => {
              const NavIcon = Icon as typeof FileText;
              const selected = label === "Invoices";
              return (
                <div
                  key={String(label)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium ${selected ? "bg-panel text-fg ring-1 ring-line" : "text-muted"}`}
                >
                  <NavIcon size={15} className={selected ? "text-accent" : "text-faint"} />
                  {String(label)}
                </div>
              );
            })}
          </div>
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["0.0381", 0],
                ["1,240.5", 1],
                ["3,250", 2],
              ].map(([value, i]) => (
                <div key={String(i)} className="rounded-xl border border-line bg-panel p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted">
                    <AssetMark index={i as 0 | 1 | 2} size={20} />
                    {assets[i as number].name}
                  </div>
                  <p className="mt-2 text-lg font-semibold tabular-nums tracking-tight text-fg sm:text-xl">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line bg-subtle px-4 py-2.5 text-xs text-muted sm:px-5">
                <span>Recent invoices</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-line">
                <MiniRow title="Brand identity — milestone 2" meta="inv-1042 · Ada Okafor" status="Paid" amount="0.0125" asset={0} />
                <MiniRow title="Monthly retainer, October" meta="inv-1043 · Northwind Ltd" status="Pending" amount="250" asset={2} />
                <MiniRow title="Workshop ticket" meta="inv-1044 · Walk-in" status="Paid" amount="120" asset={1} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <CheckoutStory assetMark={<AssetMark index={2} size={18} />} />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Illustrations for steps and products
   -------------------------------------------------------------------------- */

function CreateFragment() {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Amount</p>
        <div className="flex items-center justify-between rounded-control border border-accent bg-canvas px-3 py-2 shadow-[0_0_0_3px_rgb(var(--accent)/0.18)]">
          <span className="text-sm font-medium tabular-nums text-fg">250</span>
          <span className="text-xs text-muted">USDCx</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {assets.map((a, i) => (
          <span
            key={a.name}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${i === 2 ? "border-accent/50 bg-accent/10 text-accent-text" : "border-line-strong text-fg-2"}`}
          >
            <AssetMark index={i as 0 | 1 | 2} size={16} />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function LinkPill({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-line-strong bg-canvas py-1.5 pl-3 pr-1.5">
      <Link2 size={14} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">{path}</span>
      <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-subtle px-2 text-xs font-medium text-fg ring-1 ring-line">
        <Copy size={12} /> Copy
      </span>
    </div>
  );
}

function ShareFragment() {
  return (
    <div className="space-y-4">
      <LinkPill path="stackpay.app/pay/inv-1043" />
      <p className="flex items-center gap-1.5 text-xs text-success">
        <Check size={14} /> Link copied — send it any way you like
      </p>
    </div>
  );
}

function ReceiptFragment() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg tabular-nums">0.0125 sBTC</span>
        <span className="badge badge-success">Paid</span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-canvas px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs text-fg-2">
          <FileText size={14} className="shrink-0 text-muted" />
          <span className="truncate">receipt-inv-1042.pdf</span>
        </span>
        <Download size={14} className="shrink-0 text-accent-text" />
      </div>
      <p className="truncate font-mono text-xs text-muted">tx 0x8f3a…c21d</p>
    </div>
  );
}

function InvoiceIllustration() {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Invoice inv-1042</span>
        <span className="badge badge-success">Paid</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-b border-dashed border-line-strong pb-3 text-sm">
        <span className="truncate text-fg-2">Brand identity — milestone 2</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Total</span>
        <span className="flex items-center gap-2 font-semibold tabular-nums text-fg">
          <AssetMark index={0} size={18} /> 0.0125 sBTC
        </span>
      </div>
    </div>
  );
}

function LinkIllustration() {
  return (
    <div className="space-y-4">
      <LinkPill path="stackpay.app/l/workshop" />
      <div className="rounded-xl border border-line bg-panel p-3 shadow-card">
        <p className="text-xs text-muted">Suggested amounts</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {["10", "25", "50"].map((v, i) => (
            <span
              key={v}
              className={`rounded-lg border py-1.5 text-center text-xs font-medium tabular-nums ${i === 1 ? "border-accent/50 bg-accent/10 text-accent-text" : "border-line-strong text-fg-2"}`}
            >
              {v} STX
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function QrIllustration() {
  return (
    <div className="flex items-center gap-4">
      <div className="rounded-xl border border-line bg-panel p-2.5 shadow-card">
        <QrTile className="h-24 w-24" />
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium text-fg">Scan to pay</p>
        <p className="text-xs text-muted">Lumen Studio</p>
        <div className="flex -space-x-1">
          <AssetMark index={0} size={22} />
          <AssetMark index={1} size={22} />
          <AssetMark index={2} size={22} />
        </div>
      </div>
    </div>
  );
}

const products = [
  {
    id: "invoices",
    icon: FileText,
    label: "Standard invoices",
    title: "One request. One payment.",
    description:
      "Set an amount, asset, and expiry, then share a dedicated checkout link. The invoice closes once it’s paid.",
    art: InvoiceIllustration,
  },
  {
    id: "payment-links",
    icon: Link2,
    label: "MultiPay links",
    title: "Create once. Share often.",
    description:
      "A reusable link with a fixed price or up to three suggested amounts. Every payment is tracked separately.",
    art: LinkIllustration,
  },
  {
    id: "qr",
    icon: QrCode,
    label: "Universal QR",
    title: "Your counter, connected.",
    description:
      "One QR code for your business. Customers pick the asset and amount, then pay from their wallet.",
    art: QrIllustration,
  },
];

const verification = [
  "Contract and function match",
  "Sender and arguments match",
  "Result confirmed on-chain",
];

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      <main id="main-content" className="overflow-x-clip">
        {/* Hero ------------------------------------------------------------ */}
        <section className="relative pb-16 sm:pb-24">
          <HeroCoins />
          <PaymentPops />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-24">
            <div className="mx-auto max-w-4xl text-center">
              <FadeIn delay={0.1}>
                <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-3.5 py-1.5 text-sm text-fg-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  Built on Stacks · Testnet preview
                </span>
              </FadeIn>
              <FadeIn delay={0.2}>
                <h1 className="mt-7 text-[clamp(2.75rem,7.6vw,5.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-fg">
                  A better way to get paid{" "}
                  <span className="bg-gradient-to-r from-accent to-[#ffb08a] bg-clip-text text-transparent">
                    on-chain.
                  </span>
                </h1>
              </FadeIn>
              <FadeIn delay={0.3}>
                <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-fg-2 sm:text-xl sm:leading-8">
                  Turn a payment request into a simple checkout. Invoices,
                  reusable payment links, and QR payments in sBTC, STX, and
                  USDCx — for businesses building on Stacks.
                </p>
              </FadeIn>
              <FadeIn delay={0.4} className="mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href="/dashboard" className="btn btn-primary btn-lg w-full sm:w-auto">
                  Launch console <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <Link href="/docs#quickstart" className="btn btn-secondary btn-lg w-full sm:w-auto">
                  Read the guide <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </FadeIn>
              <FadeIn delay={0.5}>
                <p className="mt-5 text-sm text-muted">
                  Works with Leather and Xverse. Sign in with your wallet — no
                  password.
                </p>
              </FadeIn>
            </div>
            <FadeIn delay={0.6}>
              <ProductStage />
            </FadeIn>
          </div>
        </section>

        {/* Live payments ticker -------------------------------------------- */}
        <div className="border-y border-line">
          <PaymentTicker />
        </div>

        {/* Assets strip ---------------------------------------------------- */}
        <section aria-labelledby="assets-heading" className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr] lg:items-center lg:gap-10 md:py-12">
            <h2 id="assets-heading" className="text-base font-medium text-fg-2">
              Accept the assets your customers already hold
            </h2>
            <StaggerContainer as="ul" className="grid gap-3 sm:grid-cols-3">
              {assets.map((a, i) => (
                <StaggerItem as="li" key={a.name} className="flex items-center gap-3 rounded-card border border-line bg-panel px-4 py-3.5">
                  <AssetMark index={i as 0 | 1 | 2} size={36} />
                  <div>
                    <p className="text-base font-semibold text-fg">{a.name}</p>
                    <p className="text-sm text-muted">{a.description}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* How it works ---------------------------------------------------- */}
        <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <div className="max-w-2xl">
            <p className="eyebrow text-accent-text">How it works</p>
            <h2 id="how-heading" className="mt-3 text-3xl font-semibold tracking-tight text-fg md:text-5xl">
              From request to receipt in three steps.
            </h2>
            <p className="mt-5 text-lg leading-8 text-fg-2">
              No integration needed to get started. Everything happens in the
              console and your customer’s wallet.
            </p>
          </div>
          <StaggerContainer as="ol" className="mt-12 grid gap-4 lg:grid-cols-3">
            {steps.map((step, i) => {
              const Fragment = [CreateFragment, ShareFragment, ReceiptFragment][i];
              return (
                <StaggerItem as="li" key={step.title} className="card flex flex-col overflow-hidden">
                  <div className="p-6">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold tabular-nums text-accent-text">
                      {i + 1}
                    </span>
                    <h3 className="mt-5 text-xl font-semibold tracking-tight text-fg">{step.title}</h3>
                    <p className="mt-2 text-base leading-7 text-muted">{step.text}</p>
                  </div>
                  <div className="mt-auto flex min-h-[152px] flex-col justify-center border-t border-line bg-subtle p-5" aria-hidden="true">
                    <Fragment />
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </section>

        {/* Products -------------------------------------------------------- */}
        <section id="product" aria-labelledby="product-heading" className="docs-section border-t border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="eyebrow text-accent-text">Products</p>
                <h2 id="product-heading" className="mt-3 text-3xl font-semibold tracking-tight text-fg md:text-5xl">
                  Three ways to accept. One place to manage.
                </h2>
              </div>
              <p className="max-w-sm text-lg leading-8 text-fg-2">
                Pick the checkout that fits the moment, from a one-off invoice
                to your everyday counter.
              </p>
            </div>
            <StaggerContainer className="mt-12 grid gap-4 lg:grid-cols-3">
              {products.map(({ id, icon: Icon, label, title, description, art: Art }) => (
                <StaggerItem key={id}>
                  <HoverCard>
                    <Link
                      href={`/docs#${id}`}
                      className="group card flex flex-col overflow-hidden transition-colors hover:border-line-strong md:grid md:grid-cols-2 lg:flex h-full"
                    >
                      <div className="flex min-h-[200px] items-center border-b border-line bg-subtle p-6 md:border-b-0 md:border-r lg:border-b lg:border-r-0" aria-hidden="true">
                        <div className="w-full">
                          <Art />
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <p className="flex items-center gap-2 text-sm font-medium text-accent-text">
                          <Icon size={16} aria-hidden="true" /> {label}
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-fg">{title}</h3>
                        <p className="mt-3 text-base leading-7 text-muted">{description}</p>
                        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-fg-2 transition-colors group-hover:text-accent-text">
                          How it works <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </Link>
                  </HoverCard>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Trust ----------------------------------------------------------- */}
        <section aria-labelledby="trust-heading" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-20">
              <div>
                <p className="eyebrow text-accent-text">Trust by design</p>
                <h2 id="trust-heading" className="mt-3 text-3xl font-semibold tracking-tight text-fg md:text-5xl">
                  Every payment leaves a verifiable trail.
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-fg-2">
                  Your wallet signature authorizes every action, and payments
                  only count once they’re confirmed on-chain. Follow invoices,
                  inspect transaction references, and manage withdrawals from
                  one workspace.
                </p>
                <Link href="/docs#settlements" className="link mt-6 inline-flex items-center gap-2 text-base">
                  How settlement works <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className="card p-6" aria-hidden="true">
                <div className="flex items-center justify-between">
                  <p className="text-sm f-y-4semibold text-fg">Payment verification</p>
                  <span className="font-mono text-xs text-muted">inv-1042</span>
                </div>
                <ul className="mt-5 space-y-3">
                  {verification.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-base text-fg-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
                        <Check size={14} strokeWidth={2.5} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="well mt-6 flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-muted">Transaction</span>
                  <span className="truncate font-mono text-sm text-fg-2">0x8f3a…c21d</span>
                </div>
              </div>
            </div>
            <StaggerContainer as="ul" className="mt-14 grid gap-4 md:grid-cols-3">
              {trust.map(({ icon: Icon, title, text }) => (
                <StaggerItem as="li" key={title}>
                  <HoverCard className="flex h-full gap-4 rounded-card border border-line p-5 md:block md:p-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-fg-2">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-fg md:mt-4">{title}</h3>
                      <p className="mt-1.5 text-base leading-7 text-muted">{text}</p>
                    </div>
                  </HoverCard>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Closing CTA ----------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 md:pb-28">
          <div className="relative overflow-hidden rounded-card border border-line-strong bg-panel px-6 py-12 text-center sm:px-12 md:py-16">
            <div className="relative">
              <FadeIn>
                <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-fg md:text-5xl">
                  Take your first test payment today.
                </h2>
              </FadeIn>
              <FadeIn delay={0.1}>
                <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-fg-2">
                  StackPay is a testnet preview. Try the payment flows with test
                  tokens and review the current limits before you integrate.
                </p>
              </FadeIn>
              <FadeIn delay={0.2} className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href="/dashboard" className="btn btn-primary btn-lg w-full sm:w-auto">
                  Launch console <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <Link href="/docs" className="btn btn-secondary btn-lg w-full sm:w-auto">
                  Explore documentation <BookOpen size={18} aria-hidden="true" />
                </Link>
              </FadeIn>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
