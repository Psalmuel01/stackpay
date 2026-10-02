/** Documentation topics: one page each. `slug: ""` is the /docs landing page. */
export type DocTopic = { slug: string; title: string; group: string; keywords: string; description: string };

export const TOPICS: DocTopic[] = [
  { slug: "", title: "Introduction", group: "Start here", keywords: "assets testnet status overview",
    description: "What StackPay is: Bitcoin-native payments on Stacks for sBTC, STX and USDCx, with hosted checkout, payment links and an API." },
  { slug: "quickstart", title: "Your first payment", group: "Start here", keywords: "wallet leather xverse onboarding connect",
    description: "Take your first sBTC, STX or USDCx payment with StackPay: connect a wallet, sign in, create an invoice and get paid." },
  { slug: "invoices", title: "Standard invoices", group: "Accept payments", keywords: "create expiry amount receipt",
    description: "Create single-use Bitcoin invoices on Stacks with an amount, asset and expiry, share the checkout link, and get receipts." },
  { slug: "payment-links", title: "MultiPay links", group: "Accept payments", keywords: "reusable fixed suggested sku",
    description: "Reusable StackPay payment links with fixed or suggested prices. Every purchase creates its own invoice for traceability." },
  { slug: "qr", title: "Universal QR & Counter Mode", group: "Accept payments", keywords: "scan customer amount counter mode point of sale",
    description: "Accept in-person Bitcoin payments: a permanent Universal QR code, and Counter Mode for point-of-sale with a locked amount." },
  { slug: "refunds", title: "Refunds", group: "Accept payments", keywords: "refund return partial payer",
    description: "Refund sBTC, STX or USDCx payments in full or in part. StackPay records a refund only after verifying it on-chain." },
  { slug: "settlements", title: "Balances & settlement", group: "Accept payments", keywords: "withdraw processor funds balance",
    description: "How StackPay balances work: payments accrue in the processor contract and you withdraw them to your wallet on-chain." },
  { slug: "authentication", title: "Wallet authentication", group: "Build & operate", keywords: "session signature cookie challenge",
    description: "How StackPay merchant sign-in works: a signed wallet challenge, a server session, expiry, and signing out everywhere." },
  { slug: "api", title: "API reference", group: "Build & operate", keywords: "routes endpoints sdk integration keys idempotency pagination errors",
    description: "StackPay REST API reference: secret keys, idempotency, errors, pagination, every /api/v1 endpoint, and the TypeScript SDK." },
  { slug: "webhooks", title: "Webhooks", group: "Build & operate", keywords: "events signature hmac retries replay",
    description: "StackPay webhooks: event types, verifying HMAC-SHA256 signatures, retries, replay, and delivery rules for your backend." },
  { slug: "security", title: "Security & current limits", group: "Build & operate", keywords: "mainnet production reorg audit",
    description: "How StackPay protects payments (on-chain verification, reorg handling, deployment binding) and its current limits." },
  { slug: "troubleshooting", title: "Troubleshooting", group: "Build & operate", keywords: "database supabase error connection expired",
    description: "Fix common StackPay issues: wallet connection, sign-in errors, pending payments, API 401/403, and webhooks not arriving." },
];

export const topicHref = (slug: string) => (slug ? `/docs/${slug}` : "/docs");
