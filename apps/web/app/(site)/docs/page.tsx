"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Search,
  ShieldCheck,
  Terminal,
  ChevronRight,
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
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border border-[#fc6532]/20 bg-[#fc6532]/5 px-5 py-4 text-sm leading-7 text-[#e9c1b3]">
      {children}
    </div>
  );
}
function Steps({ items }: { items: string[] }) {
  return (
    <ol className="my-6 space-y-4">
      {items.map((item, i) => (
        <li key={item} className="flex gap-3 text-sm leading-7 text-white/65">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px] text-white/50">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="docs-section border-t border-white/10 py-10 first:border-0 first:pt-0"
    >
      <h2 className="mb-5 text-2xl font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:text-[#ff9069]">
          {topics.find((topic) => topic.id === id)?.title}
        </a>
      </h2>
      <div className="space-y-4 text-sm leading-7 text-white/60">
        {children}
      </div>
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
  return (
    <>
      <main id="main-content" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-b border-white/10 py-10 md:py-14">
          <div className="mb-4 flex items-center gap-2 text-xs text-[#ff9069]">
            <BookOpen size={15} />
            StackPay documentation
          </div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            From first connection
            <br className="sm:hidden" /> to confirmed payment.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/55">
            Guides for merchants. Implementation details for developers. A clear
            view of what works today and what’s still in progress.
          </p>
        </div>
        <div className="grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <aside className="self-start lg:sticky lg:top-28">
            <label className="relative block">
              <span className="sr-only">Find a documentation topic</span>
              <Search
                size={15}
                className="absolute left-3 top-3.5 text-white/40"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a topic…"
                type="search"
                className="w-full rounded-lg border border-white/15 bg-white/[0.03] py-3 pl-9 pr-3 text-xs"
              />
            </label>
            <nav
              aria-label="Documentation topics"
              className="mt-5 flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[65vh]"
            >
              {filtered.length === 0 && (
                <p role="status" className="p-3 text-sm text-white/50">
                  No matching topics. Try “wallet” or “invoice”.
                </p>
              )}
              {filtered.map((topic, index) => (
                <div key={topic.id}>
                  {(index === 0 ||
                    topic.group !== filtered[index - 1].group) && (
                    <p className="mb-2 mt-4 px-3 text-[11px] font-medium uppercase tracking-wider text-white/35">
                      {topic.group}
                    </p>
                  )}
                  <a
                    href={`#${topic.id}`}
                    onClick={() => setActive(topic.id)}
                    aria-current={active === topic.id ? "location" : undefined}
                    className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${active === topic.id ? "bg-[#fc6532]/10 text-[#ff9d7a]" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
                  >
                    {topic.title}
                  </a>
                </div>
              ))}
            </nav>
            <a
              href="https://github.com/Psalmuel01/stackpay"
              className="mt-6 flex items-center justify-between border-t border-white/10 px-3 pt-5 text-xs text-white/45 hover:text-white"
            >
              View source on GitHub <ArrowUpRight size={14} />
            </a>
          </aside>
          <article className="min-w-0 pb-12">
            <Section id="overview">
              <p>
                StackPay brings invoice creation, hosted checkout, payment
                links, receipts, and manual settlement into a wallet-connected
                workspace on Stacks. Supported payment assets are STX, sBTC, and
                USDCx, subject to the configured contracts and network.
              </p>
              <Note>
                <strong className="font-medium text-[#ffd1c1]">
                  Testnet preview.
                </strong>{" "}
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
                      className="rounded-xl border border-white/10 bg-white/[0.025] p-5 hover:border-white/25"
                    >
                      <CardIcon className="mb-3 text-[#ff9069]" size={20} />
                      <h3 className="font-medium text-white">
                        {String(title)}
                      </h3>
                      <p className="mt-1 text-xs text-white/50">
                        {String(description)}
                      </p>
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
              <Link className="primary-button" href="/dashboard">
                Open workspace <ArrowUpRight size={15} />
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
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Financial terms</caption>
                  <thead className="bg-white/5 text-white/80">
                    <tr>
                      <th scope="col" className="p-4 font-medium">
                        Term
                      </th>
                      <th scope="col" className="p-4 font-medium">
                        What it means
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
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
                          className="p-4 align-top font-medium text-white/80"
                        >
                          {term}
                        </th>
                        <td className="p-4">{detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <h3 className="font-medium text-white">
                Example: read the signed-in session
              </h3>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-5 text-xs leading-6 text-white/75">
                <code>{`// Run inside the StackPay application origin.\nconst response = await fetch("/api/auth/session", {\n  credentials: "same-origin",\n  cache: "no-store",\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error.message);\nconsole.log(result.data.walletAddress);`}</code>
              </pre>
              <h3 className="pt-3 font-medium text-white">Core routes</h3>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <caption className="sr-only">
                    Core API routes and authentication requirements
                  </caption>
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      {["Method / path", "Access", "Purpose"].map((label) => (
                        <th key={label} scope="col" className="p-4 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {routes.map(([method, path, access, purpose]) => (
                      <tr key={`${method}:${path}`}>
                        <td className="p-4">
                          <span className="mb-1 block font-mono text-[10px] text-[#ffad91]">
                            {method}
                          </span>
                          <code className="text-white/80">{path}</code>
                        </td>
                        <td className="p-4">{access}</td>
                        <td className="p-4">{purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Successful JSON responses use{" "}
                <code className="text-white/80">{`{ data: … }`}</code>; errors
                use{" "}
                <code className="text-white/80">{`{ error: { code, message } }`}</code>
                . Handle 401 by signing in again, 429 by waiting before
                retrying, and 503 as a service or configuration problem. Never
                automatically repeat a wallet payment after an ambiguous
                response.
              </p>
              <a
                href="https://github.com/Psalmuel01/stackpay/tree/main/apps/web/app/api"
                className="inline-flex items-center gap-2 text-[#ff9069] hover:text-white"
              >
                Browse all route implementations <ArrowUpRight size={15} />
              </a>
            </Section>
            <Section id="security">
              <div className="flex gap-3">
                <ShieldCheck
                  size={22}
                  className="mt-1 shrink-0 text-[#ff9069]"
                />
                <p>
                  Wallet sessions, ownership checks, explicit transaction
                  post-conditions, and chain verification protect the current
                  flows. These controls are part of ongoing hardening, not a
                  claim that the system has completed an independent security
                  audit.
                </p>
              </div>
              <ul className="list-disc space-y-3 pl-5">
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
              <div className="divide-y divide-white/10 rounded-xl border border-white/10">
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
                  <details key={title} className="group p-5">
                    <summary className="cursor-pointer font-medium text-white/85">
                      {title}
                    </summary>
                    <p className="mt-3">{body}</p>
                  </details>
                ))}
              </div>
            </Section>
            <div className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-white/40">
              <span>Found a gap in the docs?</span>
              <a
                href="https://github.com/Psalmuel01/stackpay/issues"
                className="flex items-center gap-1 hover:text-white"
              >
                Open an issue <ChevronRight size={14} />
              </a>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
