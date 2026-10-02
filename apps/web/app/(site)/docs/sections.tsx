import Link from "next/link";
import { ArrowUpRight, BookOpen, ChevronDown, ShieldCheck, Terminal } from "lucide-react";
import CodeBlock from "@/components/CodeBlock";
import { Code, Note, Steps, SubHeading } from "./components";
import { topicHref } from "./topics";

/* Content of each documentation page, keyed by topic slug. */

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
function Overview() {
  return (
    <>
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
          "API keys, endpoints, webhooks and the SDK.",
          "api",
          Terminal,
        ],
      ].map(([title, description, id, Icon]) => {
        const CardIcon = Icon as typeof BookOpen;
        return (
          <Link
            key={String(id)}
            href={topicHref(String(id))}
            className="group card flex items-start gap-4 p-5 transition-colors hover:border-line-strong"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent-text">
              <CardIcon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 font-semibold text-fg">
                {String(title)}
              </span>
              <p className="mt-1 text-sm text-muted">
                {String(description)}
              </p>
            </span>
          </Link>
        );
      })}
    </div>
    </>
  );
}

function Quickstart() {
  return (
    <>
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
    </>
  );
}

function Invoices() {
  return (
    <>
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
    </>
  );
}

function PaymentLinks() {
  return (
    <>
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
    </>
  );
}

function Qr() {
  return (
    <>
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
      turns a tablet or spare screen into a till. Key in the amount and
      press Charge: each sale gets its own QR for exactly that amount,
      which the customer can’t change, and the screen turns to Paid
      with an optional chime when that sale confirms. The customer
      approves twice (create, then pay), and an unpaid sale expires
      after 15 minutes. Open it from Universal QR, and hand over goods
      only when the screen says Paid.
    </p>
    </>
  );
}

function Refunds() {
  return (
    <>
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
    </>
  );
}

function Settlements() {
  return (
    <>
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
    </>
  );
}

function Authentication() {
  return (
    <>
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
    </>
  );
}

function Api() {
  return (
    <>
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
    <SubHeading>Conventions</SubHeading>
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
    <SubHeading>Endpoints</SubHeading>
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
    <SubHeading>TypeScript SDK</SubHeading>
    <p>
      <Code>stackpay</Code> wraps the API with types, automatic
      idempotency keys, safe retries, pagination helpers, and webhook
      verification. Install it with <Code>npm install stackpay</Code>;
      it needs Node.js 18.17 or later and is ES modules only.
    </p>
    <CodeBlock lang="ts" title="server.ts" code={`import { StackPay } from "stackpay";

const stackpay = new StackPay({ secretKey: process.env.STACKPAY_SECRET_KEY!, baseUrl: "https://<your-stackpay-origin>" });
const invoice = await stackpay.invoices.create({ amount: "25", currency: "USDCx", metadata: { order_id: "382" } });
redirect(invoice.checkout_url);`} />
    <a
      href="https://github.com/Psalmuel01/stackpay/tree/main/packages/sdk"
      className="link inline-flex items-center gap-2"
    >
      SDK reference <ArrowUpRight size={16} aria-hidden="true" />
    </a>
    </>
  );
}

function Webhooks() {
  return (
    <>
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
    <SubHeading>Verify the signature</SubHeading>
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
    </>
  );
}

function Security() {
  return (
    <>
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
        The contracts have not had an independent audit. Subscriptions
        and automated settlement are not offered.
      </li>
      <li>
        Token availability and asset identifiers depend on the
        selected deployment. Testnet tokens have no production
        settlement value.
      </li>
    </ul>
    </>
  );
}

function Troubleshooting() {
  return (
    <>
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
    </>
  );
}

export const SECTIONS: Record<string, () => React.JSX.Element> = {
  "": Overview,
  "quickstart": Quickstart,
  "invoices": Invoices,
  "payment-links": PaymentLinks,
  "qr": Qr,
  "refunds": Refunds,
  "settlements": Settlements,
  "authentication": Authentication,
  "api": Api,
  "webhooks": Webhooks,
  "security": Security,
  "troubleshooting": Troubleshooting,
};
