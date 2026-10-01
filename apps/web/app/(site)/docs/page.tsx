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
import CodeBlock from "@/components/CodeBlock";

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
    keywords: "scan customer amount counter mode",
  },
  {
    id: "refunds",
    title: "Refunds",
    group: "Accept payments",
    keywords: "refund return partial payer",
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
    keywords: "routes endpoints sdk integration keys idempotency pagination errors",
  },
  {
    id: "webhooks",
    title: "Webhooks",
    group: "Build & operate",
    keywords: "events signature hmac retries replay",
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
/** Public v1 API. Every route authenticates with a secret key carrying the listed scope. */
const routes = [
  ["POST", "/api/v1/invoices", "invoices:write", "Create a draft invoice and get its hosted checkout URL."],
  ["GET", "/api/v1/invoices", "invoices:read", "List invoices, newest first; filter with ?status=."],
  ["GET", "/api/v1/invoices/{id}", "invoices:read", "Retrieve an invoice with its confirmed payment."],
  ["POST", "/api/v1/invoices/{id}/cancel", "invoices:write", "Cancel a draft before the customer creates it on-chain."],
  ["POST", "/api/v1/payment-links", "payment_links:write", "Create a MultiPay link draft (activated in the console)."],
  ["GET", "/api/v1/payment-links[/{id}]", "payment_links:read", "List or retrieve payment links."],
  ["GET", "/api/v1/receipts[/{id}]", "receipts:read", "List or retrieve payment receipts."],
  ["GET", "/api/v1/refunds[/{id}]", "refunds:read", "List or retrieve verified refunds."],
  ["GET", "/api/v1/settlements[/{id}]", "settlements:read", "List or retrieve withdrawals (read-only)."],
  ["GET", "/api/v1/events[/{id}]", "events:read", "List or retrieve events; filter with ?type=."],
  ["GET / POST", "/api/v1/webhook-endpoints", "webhooks:read / write", "List or register endpoints (secret shown once)."],
  ["GET / PATCH / DELETE", "/api/v1/webhook-endpoints/{id}", "webhooks:read / write", "Read, update, or remove an endpoint."],
  ["POST", "/api/v1/webhook-endpoints/{id}/rotate-secret", "webhooks:write", "Issue a new signing secret."],
  ["POST", "/api/v1/webhook-endpoints/{id}/test", "webhooks:write", "Send a signed stackpay.ping."],
  ["GET", "/api/v1/webhook-deliveries[/{id}]", "webhooks:read", "Delivery history with attempts and responses."],
  ["POST", "/api/v1/webhook-deliveries/{id}/replay", "webhooks:write", "Re-send a delivery as a new attempt."],
  ["GET", "/api/v1/reports/reconciliation", "invoices:read", "Stream the reconciliation CSV (?from=&to=&status=)."],
];
const eventTypes = [
  ["invoice.created", "An invoice exists (API drafts included)."],
  ["invoice.pending", "A draft was created on-chain at checkout and can be paid."],
  ["invoice.paid", "Payment confirmed on-chain. Fulfil on this event."],
  ["invoice.payment_reverted", "The block with the payment was reorganized away. Stop treating the invoice as paid until invoice.paid arrives again."],
  ["invoice.expired", "The invoice can no longer be paid."],
  ["invoice.canceled", "A draft was canceled."],
  ["invoice.refunded", "A verified refund was sent to the original payer; data.object.refund has the amount and transaction."],
  ["settlement.confirmed", "A withdrawal to your wallet confirmed on-chain."],
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
    <div className={`alert my-5 text-sm leading-6 ${tone === "warning" ? "alert-warning" : ""}`}>
      <Icon
        size={16}
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
              <p>
                <strong className="font-semibold text-fg">Counter Mode</strong>{" "}
                turns a tablet or spare screen into a till: key in the amount,
                show a QR prefilled with it, and hear a chime when the payment
                confirms. Open it from Universal QR. Hand over goods only after
                the payment shows as confirmed in the feed.
              </p>
            </Section>
            <Section id="refunds">
              <p>
                Refund a paid invoice in full or in part from{" "}
                <Link className="link" href="/invoices">Invoices</Link>. The
                refund is an ordinary transfer from your wallet back to the
                wallet that paid, so you approve it in your wallet like any
                other transaction.
              </p>
              <Steps
                items={[
                  "Choose Refund on a paid invoice and enter the amount. You can refund up to what was paid, less earlier refunds.",
                  "Approve the transfer in your wallet. It is limited by a post-condition to exactly that amount, and tagged with the invoice id.",
                  "StackPay records the refund only after it verifies the confirmed transfer on-chain: sender, payer, asset, amount, and tag.",
                ]}
              />
              <Note>
                A full refund marks the invoice Refunded. Each refund sends{" "}
                <Code>invoice.refunded</Code> to your webhooks, and refunds
                appear in the reconciliation export and at{" "}
                <Code>/api/v1/refunds</Code>. Refunds are paid from your wallet,
                not from the processor balance, so withdraw first if needed.
                StackPay checks your wallet balance before asking you to sign. An
                invoice paid from your own wallet can’t be refunded, because
                Stacks doesn’t allow transfers to yourself.
              </Note>
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
                          "Recorded payments over the displayed period, per asset and exact to the token’s decimals; not the amount available to withdraw. StackPay shows no fiat valuations.",
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
                The versioned API lives at <Code>/api/v1</Code> on your StackPay
                origin. Create a secret key in{" "}
                <Link className="link" href="/developer">Developer</Link> and
                send it as a bearer token. Keys are shown once, stored only as a
                hash, carry scopes, and are bound to the deployment’s network:{" "}
                <Code>sk_test_…</Code> works only on testnet and{" "}
                <Code>sk_live_…</Code> only on mainnet.
              </p>
              <CodeBlock lang="bash" title="cURL" code={`curl https://<your-stackpay-origin>/api/v1/invoices \\
  -H "Authorization: Bearer $STACKPAY_SECRET_KEY" \\
  -H "Idempotency-Key: order-382" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "25",
    "currency": "USDCx",
    "description": "Order #382",
    "metadata": { "order_id": "382" },
    "success_url": "https://shop.example/orders/382"
  }'`} />
              <p>
                The response is a <Code>draft</Code> invoice with a{" "}
                <Code>checkout_url</Code>. Send the customer there: their
                wallet creates the invoice on-chain (<Code>pending</Code>) and
                pays it (<Code>paid</Code>). No merchant signature is needed
                per invoice; set up Universal QR once in the console. Fulfil
                the order on the <Code>invoice.paid</Code> webhook, never on
                arrival at <Code>success_url</Code>.
              </p>
              <h3 className="pt-2 text-lg font-semibold text-fg">Conventions</h3>
              <ul className="list-disc space-y-3 pl-5 marker:text-faint">
                <li>
                  <strong className="font-semibold text-fg">Money</strong> is an
                  exact decimal string (<Code>amount</Code>) plus base units
                  (<Code>amount_units</Code>: 6 decimals for STX and USDCx, 8
                  for sBTC). Send amounts as strings.
                </li>
                <li>
                  <strong className="font-semibold text-fg">Idempotency:</strong>{" "}
                  send an <Code>Idempotency-Key</Code> on writes. A retry with
                  the same key and body returns the original response for 24
                  hours; the same key with a different body is rejected.
                </li>
                <li>
                  <strong className="font-semibold text-fg">Errors</strong> look
                  like <Code>{`{ error: { type, code, message, param?, request_id } }`}</Code>.
                  Quote the <Code>request_id</Code> when asking for help.
                </li>
                <li>
                  <strong className="font-semibold text-fg">Pagination:</strong>{" "}
                  lists return <Code>{`{ object: "list", data, has_more, next_cursor }`}</Code>;
                  pass <Code>starting_after=next_cursor</Code> and{" "}
                  <Code>limit</Code> (1–100, default 20).
                </li>
                <li>
                  <strong className="font-semibold text-fg">Rate limit:</strong>{" "}
                  100 requests per 10 seconds per key. Back off on 429.
                </li>
                <li>
                  <strong className="font-semibold text-fg">Metadata:</strong>{" "}
                  up to 50 string keys (key ≤ 40 characters, value ≤ 500).
                  Payment links copy their metadata, such as a SKU, onto every
                  invoice bought through them.
                </li>
              </ul>
              <h3 className="pt-2 text-lg font-semibold text-fg">Endpoints</h3>
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
                      API v1 endpoints and required scopes
                    </caption>
                    <thead>
                      <tr>
                        {["Method and path", "Scope", "Purpose"].map((label) => (
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
                          <td className="whitespace-nowrap align-top font-mono text-xs text-muted">
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
              <h3 className="pt-2 text-lg font-semibold text-fg">TypeScript SDK</h3>
              <p>
                <Code>@stackpay/sdk</Code> wraps the API with types, automatic
                idempotency keys, safe retries, pagination helpers, and webhook
                verification. It isn’t on npm yet; install it from the
                repository’s <Code>packages/sdk</Code>.
              </p>
              <CodeBlock lang="ts" title="server.ts" code={`import { StackPay } from "@stackpay/sdk";

const stackpay = new StackPay({ secretKey: process.env.STACKPAY_SECRET_KEY!, baseUrl: "https://<your-stackpay-origin>" });
const invoice = await stackpay.invoices.create({ amount: "25", currency: "USDCx", metadata: { order_id: "382" } });
redirect(invoice.checkout_url);`} />
              <a
                href="https://github.com/Psalmuel01/stackpay/tree/main/packages/sdk"
                className="link inline-flex items-center gap-2"
              >
                SDK reference <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </Section>
            <Section id="webhooks">
              <p>
                Register HTTPS endpoints in{" "}
                <Link className="link" href="/developer">Developer</Link> or
                through the API, and choose which events each receives. Every
                delivery is a JSON event signed with the endpoint’s secret.
              </p>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <caption className="sr-only">Webhook event types</caption>
                    <thead>
                      <tr>
                        <th scope="col">Event</th>
                        <th scope="col">Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventTypes.map(([type, meaning]) => (
                        <tr key={type}>
                          <td className="whitespace-nowrap align-top font-mono text-[13.5px] text-fg">{type}</td>
                          <td className="align-top text-sm text-fg-2">{meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <h3 className="pt-2 text-lg font-semibold text-fg">Verify the signature</h3>
              <p>
                The <Code>X-StackPay-Signature</Code> header is{" "}
                <Code>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</Code>, where{" "}
                <Code>v1</Code> is HMAC-SHA256 of <Code>{"`${t}.${rawBody}`"}</Code>{" "}
                with your endpoint secret. Compute it over the raw body before
                parsing, compare in constant time, and reject timestamps more
                than five minutes old.
              </p>
              <CodeBlock lang="ts" title="app/api/webhooks/stackpay/route.ts" code={`export async function POST(request: Request) {
  const body = await request.text();
  const event = stackpay.webhooks.constructEvent(body, request.headers.get("x-stackpay-signature"), process.env.STACKPAY_WEBHOOK_SECRET!);
  if (event.type === "invoice.paid") await fulfil(event.data.object.metadata.order_id);
  return new Response(null, { status: 200 });
}`} />
              <ul className="list-disc space-y-3 pl-5 marker:text-faint">
                <li>
                  Delivery is at least once. Deduplicate on the event{" "}
                  <Code>id</Code> (also in <Code>X-StackPay-Event-Id</Code>).
                </li>
                <li>
                  Respond with any 2xx within 10 seconds. Failures are retried
                  after 1 minute, 5 minutes, 30 minutes, and 2 hours, then
                  marked dead. A 410 response, or repeated failures, disables
                  the endpoint.
                </li>
                <li>
                  Replay any delivery from Developer or with{" "}
                  <Code>POST /api/v1/webhook-deliveries/{"{id}"}/replay</Code>.
                  Rotate a secret at any time; the old one stops working
                  immediately.
                </li>
                <li>
                  Endpoints must be public HTTPS URLs. Private and loopback
                  addresses are refused, including after DNS resolution.
                </li>
              </ul>
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
                  Chain events are processed through a durable queue with
                  retries. Reorganized payments are rolled back and reported
                  with <Code>invoice.payment_reverted</Code>; a refund already
                  sent stays recorded, because the transfer really happened.
                </li>
                <li>
                  Every chain record is bound to the contract deployment it
                  came from, so a contract upgrade never re-points past
                  invoices or payments.
                </li>
                <li>
                  The contracts have not had an independent audit. The SDK is
                  not yet on npm. Subscriptions and automated settlement are
                  not offered.
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
                    "Verify that NEXT_PUBLIC_APP_URL (or STACKPAY_APP_ORIGIN, if set) matches the exact HTTPS origin, and that the server database URL and key belong to the same project. Check the server error code without logging credentials or signed challenge contents.",
                  ],
                  [
                    "Payment is pending or missing from the dashboard",
                    "Look up the transaction on the configured network. A submitted transaction is not a confirmed payment. Keep the transaction ID for investigation and do not pay again until its result is known.",
                  ],
                  [
                    "API returns 401 or 403",
                    "401 means the key is missing, unknown, revoked, expired, or for the other network (sk_test_ on testnet, sk_live_ on mainnet). 403 means the key lacks the route’s scope; create a key with that scope in Developer.",
                  ],
                  [
                    "Webhooks aren’t arriving",
                    "Open Developer → Webhooks and check the endpoint’s status and recent deliveries. Disabled endpoints show why. Send a test event, fix the endpoint, then replay the failed deliveries.",
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
