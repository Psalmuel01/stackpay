"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Hash,
  Info,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import Footer from "@/components/Footer";

const topics = [
  {
    id: "overview",
    title: "Introduction",
    group: "Start here",
    keywords: "assets testnet status",
  },
  {
    id: "quickstart",
    title: "Your first payment",
    group: "Start here",
    keywords: "wallet leather xverse onboarding connect",
  },
  {
    id: "invoices",
    title: "Standard invoices",
    group: "Accept payments",
    keywords: "create expiry amount receipt",
  },
  {
    id: "payment-links",
    title: "MultiPay links",
    group: "Accept payments",
    keywords: "reusable fixed suggested",
  },
  {
    id: "qr",
    title: "Universal QR",
    group: "Accept payments",
    keywords: "scan customer amount",
  },
  {
    id: "settlements",
    title: "Balances & settlement",
    group: "Accept payments",
    keywords: "withdraw processor funds receipts",
  },
  {
    id: "authentication",
    title: "Wallet authentication",
    group: "Build & operate",
    keywords: "session signature cookie challenge",
  },
  {
    id: "api",
    title: "API reference",
    group: "Build & operate",
    keywords: "routes endpoints sdk integration",
  },
  {
    id: "security",
    title: "Security & current limits",
    group: "Build & operate",
    keywords: "mainnet production reorg reconciliation",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    group: "Build & operate",
    keywords: "database supabase error connection expired",
  },
];
const routes = [
  [
    "POST",
    "/api/auth/challenge",
    "Origin",
    "Issue a five-minute sign-in challenge.",
  ],
  [
    "POST",
    "/api/auth/verify",
    "Challenge cookie",
    "Verify the signed message and create a session.",
  ],
  [
    "GET",
    "/api/auth/session",
    "Session if present",
    "Read the current authenticated wallet.",
  ],
  [
    "DELETE",
    "/api/auth/session",
    "Session + origin",
    "Revoke the current session.",
  ],
  [
    "GET / POST",
    "/api/merchant/profile",
    "Merchant",
    "Read or update your merchant profile.",
  ],
  [
    "GET / POST",
    "/api/invoices",
    "Merchant",
    "List invoices or prepare a creation transaction.",
  ],
  [
    "POST",
    "/api/invoices/confirm",
    "Merchant",
    "Verify on-chain creation and persist the invoice.",
  ],
  [
    "GET / POST",
    "/api/payment-links",
    "Merchant",
    "List or prepare reusable payment links.",
  ],
  [
    "GET",
    "/api/payment-links/public/[slug]",
    "Public",
    "Read the public checkout details.",
  ],
  [
    "GET / POST",
    "/api/qr-link",
    "Merchant",
    "Read or prepare the universal QR route.",
  ],
  [
    "GET / POST",
    "/api/settlements",
    "Merchant",
    "Read settlement data or prepare a withdrawal.",
  ],
  [
    "POST",
    "/api/settlements/confirm",
    "Merchant",
    "Verify a withdrawal transaction.",
  ],
  [
    "GET / PATCH",
    "/api/notifications",
    "Merchant",
    "Read or mark merchant notifications.",
  ],
  [
    "POST",
    "/api/webhooks/chainhooks",
    "Webhook secret",
    "Receive configured Chainhook events.",
  ],
];
function Note({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={`alert my-6 text-base leading-7 ${tone === "warning" ? "alert-warning" : ""}`}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={`mt-1 shrink-0 ${tone === "warning" ? "" : "text-muted"}`}
      />
      <div>{children}</div>
    </div>
  );
}
function Steps({ items }: { items: string[] }) {
  return (
    <ol className="my-6 space-y-4">
      {items.map((item, i) => (
        <li key={item} className="flex gap-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-subtle text-xs font-semibold tabular-nums text-fg-2">
            {i + 1}
          </span>
          <span className="text-fg-2">{item}</span>
        </li>
      ))}
    </ol>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[0.875em] text-fg">
      {children}
    </code>
  );
}
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="docs-section border-t border-line py-12 first:border-0 first:pt-0"
    >
      <h2 className="group mb-5 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        <a href={`#${id}`} className="inline-flex items-center gap-2">
          {topics.find((topic) => topic.id === id)?.title}
          <Hash
            size={20}
            aria-hidden="true"
            className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
          />
        </a>
      </h2>
      <div className="space-y-5 text-base leading-7 text-fg-2">{children}</div>
    </section>
  );
}
export default function DocsPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("overview");
  useEffect(() => {
    const sync = () => setActive(window.location.hash.slice(1) || "overview");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const filtered = topics.filter((topic) =>
    `${topic.title} ${topic.keywords}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const activeTopic = topics.find((topic) => topic.id === active) ?? topics[0];
  const renderToc = (onNavigate?: (event: React.MouseEvent<HTMLAnchorElement>) => void) => (
    <>
      <label className="relative block">
        <span className="sr-only">Find a documentation topic</span>
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a topic…"
          type="search"
          className="field pl-10"
        />
      </label>
      <nav aria-label="Documentation topics" className="mt-4">
        {filtered.length === 0 && (
          <p role="status" className="px-1 py-3 text-sm text-muted">
            No matching topics. Try “wallet” or “invoice”.
          </p>
        )}
        {filtered.map((topic, index) => (
          <div key={topic.id}>
            {(index === 0 || topic.group !== filtered[index - 1].group) && (
              <p className={`mb-1.5 text-xs font-semibold text-fg ${index === 0 ? "" : "mt-6"}`}>
                {topic.group}
              </p>
            )}
            <a
              href={`#${topic.id}`}
              onClick={(event) => {
                setActive(topic.id);
                onNavigate?.(event);
              }}
              aria-current={active === topic.id ? "location" : undefined}
              className={`-ml-px flex min-h-10 items-center border-l-2 py-1.5 pl-4 text-sm transition-colors ${active === topic.id ? "border-accent font-medium text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"}`}
            >
              {topic.title}
            </a>
          </div>
        ))}
      </nav>
    </>
  );
  return (
    <>
      <main id="main-content" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-b border-line py-12 md:py-16">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-accent-text">
            <BookOpen size={16} aria-hidden="true" />
            StackPay documentation
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-fg md:text-5xl">
            From first connection to confirmed payment.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-fg-2">
            Step-by-step guides for merchants, implementation details for
            developers, and a clear view of what works today and what’s still
            in progress.
          </p>
        </div>
        <details className="group sticky top-16 z-30 -mx-4 border-b border-line bg-canvas/95 px-4 backdrop-blur-xl sm:top-[72px] sm:-mx-6 sm:px-6 lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted">On this page</span>
              <span className="text-line-strong" aria-hidden="true">/</span>
              <span className="truncate font-medium text-fg">{activeTopic.title}</span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className="shrink-0 text-muted transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="max-h-[60vh] overflow-y-auto pb-5 pt-1">
            {renderToc((event) => {
              const details = event.currentTarget.closest("details");
              if (details) details.open = false;
            })}
          </div>
        </details>
        <div className="grid gap-8 py-10 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-16 lg:py-12">
          <aside className="hidden self-start lg:sticky lg:top-[104px] lg:block">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto pb-2 pr-1">
              {renderToc()}
            </div>
            <a
              href="https://github.com/Psalmuel01/stackpay"
              className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-5 text-sm text-muted hover:text-fg"
            >
              View source on GitHub <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </aside>
          <article className="min-w-0 max-w-[720px] pb-12">
            <Section id="overview">
              <p>
                StackPay brings invoice creation, hosted checkout, payment
                links, receipts, and manual settlement into a wallet-connected
                workspace on Stacks. Supported payment assets are STX, sBTC, and
                USDCx, subject to the configured contracts and network.
              </p>
              <Note tone="warning">
                <strong className="font-semibold">Testnet preview.</strong>{" "}
                The current release is an MVP under active development.
                Independent contract review and further operational hardening
                remain prerequisites for handling meaningful mainnet funds.
              </Note>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "Merchant guide",
                    "Take your first payment step by step.",
                    "quickstart",
                    BookOpen,
                  ],
                  [
                    "Developer reference",
                    "Understand authentication and routes.",
                    "api",
                    Terminal,
                  ],
                ].map(([title, description, id, Icon]) => {
                  const CardIcon = Icon as typeof BookOpen;
                  return (
                    <a
                      key={String(id)}
                      href={`#${id}`}
                      className="group card flex items-start gap-4 p-5 transition-colors hover:border-line-strong"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent-text">
                        <CardIcon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <h3 className="flex items-center justify-between gap-2 font-semibold text-fg">
                          {String(title)}
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                          {String(description)}
                        </p>
                      </span>
                    </a>
                  );
                })}
              </div>
            </Section>
            <Section id="quickstart">
              <p>
                You’ll need Leather or Xverse, the app’s configured Stacks
                network, and enough test tokens for the payment and network
                fees. Both merchant creation and customer payment can require
                wallet approval.
              </p>
              <Steps
                items={[
                  "Open the workspace and connect Leather or Xverse. Select the account and network you intend to use.",
                  "Choose “Sign in with wallet” and approve the message. Sign-in proves wallet ownership; it does not move funds or charge a fee.",
                  "Complete your merchant profile so customers can recognize your business.",
                  "Create a standard invoice. Choose the asset, amount, and expiry, then approve the creation transaction.",
                  "Wait for on-chain confirmation before sharing the checkout link. Open the link as a customer, connect a funded wallet, and approve payment.",
                  "Wait for payment confirmation. Review the invoice and receipt, then inspect the processor balance in Settlements.",
                ]}
              />
              <Link className="btn btn-primary w-full sm:w-auto" href="/dashboard">
                Launch console <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </Section>
            <Section id="invoices">
              <p>
                A standard invoice is a single-use payment request. Set the
                amount and asset, add customer details where needed, and choose
                an expiry. Once paid, the invoice cannot accept another payment.
              </p>
              <Steps
                items={[
                  "Choose Standard from Create invoice and review the payment details.",
                  "Approve the creation transaction. A wallet approval or transaction ID alone does not mean the invoice is confirmed.",
                  "Share the hosted checkout URL after confirmation. Your customer reviews the request and approves the payment.",
                  "Check the confirmed result and download the available PDF receipt.",
                ]}
              />
              <Note>
                If a transaction is pending, keep its transaction ID and check
                its chain status before submitting another payment. Network
                confirmation can take time.
              </Note>
            </Section>
            <Section id="payment-links">
              <p>
                MultiPay is a reusable payment route for repeated purchases or
                collections. A link uses one asset and either a fixed amount or
                up to three suggested amounts. Each customer payment creates a
                separate invoice for traceability.
              </p>
              <Steps
                items={[
                  "Choose MultiPay from Create invoice, then configure the description, asset, and pricing.",
                  "Approve creation and wait for the link to be confirmed.",
                  "Copy the public link from Payment links. Share the same URL with multiple customers.",
                ]}
              />
              <p>
                Use a standard invoice when one named request should close after
                payment. Use MultiPay when multiple customers should pay through
                the same destination.
              </p>
            </Section>
            <Section id="qr">
              <p>
                Universal QR gives your business a stable public checkout
                destination. Customers choose their amount and a supported
                asset. It’s useful at a counter, an event, or anywhere a
                scannable payment destination is easier than sending individual
                invoices.
              </p>
              <Steps
                items={[
                  "Open Universal QR in the workspace and set up your public route.",
                  "Review the public checkout and merchant details before displaying its QR code.",
                  "Ask the customer to scan, select an asset and amount, and approve payment in their wallet.",
                  "Confirm the payment in your merchant records before treating the sale as complete.",
                ]}
              />
            </Section>
            <Section id="settlements">
              <p>
                Payments accrue in the processor contract’s merchant balance.
                They do not automatically arrive in an external settlement
                wallet. A merchant initiates a withdrawal and approves the
                transaction.
              </p>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <caption className="sr-only">Financial terms</caption>
                    <thead>
                      <tr>
                        <th scope="col">Term</th>
                        <th scope="col">What it means</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          "Available balance",
                          "The balance currently held for the merchant in the processor contract.",
                        ],
                        [
                          "Payment volume",
                          "Recorded payments over the displayed period; not the amount available to withdraw.",
                        ],
                        [
                          "USD estimate",
                          "A display conversion. Current demo conversion rates are not a live market quote or an accounting valuation.",
                        ],
                        [
                          "Settlement",
                          "A manual on-chain withdrawal from the processor balance.",
                        ],
                      ].map(([term, detail]) => (
                        <tr key={term}>
                          <th
                            scope="row"
                            className="whitespace-nowrap bg-transparent py-4 align-top text-sm font-semibold text-fg [tr:last-child_&]:border-b-0"
                          >
                            {term}
                          </th>
                          <td className="align-top text-fg-2">{detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p>
                Review the asset, amount, recipient, and network fee before
                approving a withdrawal. Treat it as complete only after on-chain
                confirmation.
              </p>
            </Section>
            <Section id="authentication">
              <p>
                Connecting a wallet selects an account. Signing in proves
                ownership and establishes a server session. Merchant routes use
                that session for authorization; passing a wallet address alone
                is insufficient.
              </p>
              <Steps
                items={[
                  "POST /api/auth/challenge with the connected walletAddress from the same app origin. The response supplies a message and sets a challenge cookie.",
                  "Use the selected wallet’s stx_signMessage method to sign that exact message.",
                  "POST /api/auth/verify with signature and publicKey. The server verifies the address and signature and consumes the challenge once.",
                  "Use the resulting HttpOnly session cookie for merchant requests. The session expires after eight hours; DELETE /api/auth/session signs out.",
                ]}
              />
              <p>
                Challenges expire after five minutes and are limited to ten per
                wallet per minute. Production uses Secure, SameSite=Strict
                cookies and requires the configured HTTPS origin. Supported
                identities are single-signature Stacks addresses.
              </p>
            </Section>
            <Section id="api">
              <p>
                The active API lives in the Next.js application. These are
                application routes, not a versioned public integration contract.
                Merchant requests require wallet authentication; mutations also
                require the matching app origin.
              </p>
              <Note>
                The SDK package is scaffolding. There is no supported public
                API-key onboarding flow or production SDK quickstart yet. Use
                the application for payments and consult the route source when
                developing inside this repository.
              </Note>
              <h3 className="pt-2 text-lg font-semibold text-fg">
                Example: read the signed-in session
              </h3>
              <pre className="overflow-x-auto rounded-xl border border-line bg-subtle p-5 font-mono text-[13.5px] leading-6 text-fg-2">
                <code>{`// Run inside the StackPay application origin.\nconst response = await fetch("/api/auth/session", {\n  credentials: "same-origin",\n  cache: "no-store",\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error.message);\nconsole.log(result.data.walletAddress);`}</code>
              </pre>
              <h3 className="pt-2 text-lg font-semibold text-fg">Core routes</h3>
              <div className="card overflow-hidden">
                <ul className="divide-y divide-line sm:hidden">
                  {routes.map(([method, path, access, purpose]) => (
                    <li key={`${method}:${path}`} className="space-y-1.5 px-5 py-4">
                      <p className="font-mono text-xs font-semibold text-accent-text">
                        {method}
                      </p>
                      <p className="break-all font-mono text-[13.5px] text-fg">{path}</p>
                      <p className="text-sm text-fg-2">{purpose}</p>
                      <span className="badge badge-neutral">{access}</span>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="data-table">
                    <caption className="sr-only">
                      Core API routes and authentication requirements
                    </caption>
                    <thead>
                      <tr>
                        {["Method and path", "Access", "Purpose"].map((label) => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map(([method, path, access, purpose]) => (
                        <tr key={`${method}:${path}`}>
                          <td className="align-top">
                            <span className="mb-1 block font-mono text-xs font-semibold text-accent-text">
                              {method}
                            </span>
                            <code className="whitespace-nowrap font-mono text-[13.5px] text-fg">
                              {path}
                            </code>
                          </td>
                          <td className="whitespace-nowrap align-top text-sm text-muted">
                            {access}
                          </td>
                          <td className="min-w-[200px] align-top text-sm text-fg-2">
                            {purpose}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p>
                Successful JSON responses use{" "}
                <Code>{`{ data: … }`}</Code>; errors
                use{" "}
                <Code>{`{ error: { code, message } }`}</Code>. Handle 401 by signing in again, 429 by waiting before
                retrying, and 503 as a service or configuration problem. Never
                automatically repeat a wallet payment after an ambiguous
                response.
              </p>
              <a
                href="https://github.com/Psalmuel01/stackpay/tree/main/apps/web/app/api"
                className="link inline-flex items-center gap-2"
              >
                Browse all route implementations <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </Section>
            <Section id="security">
              <div className="alert text-base leading-7">
                <ShieldCheck
                  size={18}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-accent-text"
                />
                <p>
                  Wallet sessions, ownership checks, explicit transaction
                  post-conditions, and chain verification protect the current
                  flows. These controls are part of ongoing hardening, not a
                  claim that the system has completed an independent security
                  audit.
                </p>
              </div>
              <ul className="list-disc space-y-4 pl-5 marker:text-faint">
                <li>
                  Clarity contracts own payment state and processor balances.
                  Supabase stores application records, profiles, and
                  notifications.
                </li>
                <li>
                  Transaction confirmation checks the configured contract,
                  function, sender, arguments, and result against canonical
                  anchored chain data.
                </li>
                <li>
                  Durable reconciliation, complete reorg recovery, and
                  production operating procedures remain open work.
                </li>
                <li>
                  Subscriptions, automated settlement, merchant email
                  notifications, and a public SDK are not available as
                  production features.
                </li>
                <li>
                  Token availability and asset identifiers depend on the
                  selected deployment. Testnet tokens have no production
                  settlement value.
                </li>
              </ul>
            </Section>
            <Section id="troubleshooting">
              <p>
                Start with the exact error, current network, and transaction ID
                if one exists. Never share seed phrases, private keys, or server
                credentials.
              </p>
              <div className="card divide-y divide-line overflow-hidden">
                {[
                  [
                    "Leather or Xverse does not connect",
                    "Unlock the extension and select the app’s network. Refresh the page and reconnect using the wallet picker. After changing accounts or installing an extension, reconnect before signing in.",
                  ],
                  [
                    "Signature is invalid or expired",
                    "Request a fresh sign-in challenge and sign promptly using the connected account. Challenges expire after five minutes and cannot be reused.",
                  ],
                  [
                    "The app is using an offline local database",
                    "For local development, start Supabase. For a hosted database, set the server SUPABASE_URL and a matching SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY. Restart or redeploy the app after changing environment variables.",
                  ],
                  [
                    "A required database table or function is missing",
                    "Apply the wallet-session migration to the database the app actually uses and refresh the Supabase API schema cache. If SQL was applied manually, verify the schema before repairing migration history; do not blindly rerun table creation.",
                  ],
                  [
                    "Sign-in fails only on the deployed site",
                    "Verify that STACKPAY_APP_ORIGIN matches the exact HTTPS origin, and that the server database URL and key belong to the same project. Check the server error code without logging credentials or signed challenge contents.",
                  ],
                  [
                    "Payment is pending or missing from the dashboard",
                    "Look up the transaction on the configured network. A submitted transaction is not a confirmed payment. Keep the transaction ID for investigation and do not pay again until its result is known.",
                  ],
                ].map(([title, body]) => (
                  <details key={title} className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-fg transition-colors hover:bg-subtle/60 [&::-webkit-details-marker]:hidden">
                      {title}
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 text-muted transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <p className="px-5 pb-5 text-fg-2">{body}</p>
                  </details>
                ))}
              </div>
            </Section>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-muted">
              <span>Found a gap in the docs?</span>
              <a
                href="https://github.com/Psalmuel01/stackpay/issues"
                className="link inline-flex min-h-10 items-center gap-1"
              >
                Open an issue <ChevronRight size={16} aria-hidden="true" />
              </a>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
