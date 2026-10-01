# StackPay

StackPay is a Bitcoin-native payment gateway on Stacks for `sBTC`, `STX`, and `USDCx`. It combines on-chain invoices and payment routes with a merchant-facing Next.js console, Supabase-backed metadata, hosted checkout pages, receipts, and webhook-driven notifications.

## StackPay v2

Developer-first merchant infrastructure for Bitcoin-backed payments on Stacks. It is running on testnet. Mainnet requires the independent contract review in the [release gate](docs/stackpay-v2-implementation.md#release-gate).

- **Versioned API** (`/api/v1`):
  - hashed, scoped, environment-bound secret keys;
  - `Idempotency-Key` on writes;
  - cursor pagination, exact decimal and base-unit amounts, and request ids on every error.
- **Signed merchant webhooks:**
  - HMAC-SHA256 with timestamp, and encrypted signing secrets;
  - retries at 1m, 5m, 30m and 2h, then a dead-letter queue;
  - replay, SSRF-safe delivery, and automatic endpoint disablement.
- **Durable chain projection:** a Chainhook inbox with leases and retries, atomic payment projection, and deterministic reorg rollback and reapply. Every chain record is bound to its contract deployment.
- **TypeScript SDK** in [`packages/sdk`](packages/sdk): typed client, automatic idempotency, safe retries, pagination and webhook verification. Not yet published to npm.
- **Merchant operations:**
  - reconciliation CSV (orders → invoices → payments → receipts → refunds);
  - on-chain-verified full and partial refunds;
  - Counter Mode for in-person sales;
  - SKU metadata and return URLs on MultiPay links.
- **Operations:**
  - readiness and metrics endpoints with alerts;
  - structured logs with redaction;
  - a fail-closed production configuration check;
  - CI across web, SDK, contracts and PostgreSQL.

Plans and status:
- [Audit](docs/stackpay-v2-audit.md)
- [Prioritized issues](docs/stackpay-v2-issues.md)
- [Implementation plan](docs/stackpay-v2-implementation.md)
- [Settlement ADR](docs/adr/0001-settlement-model.md)

## Start here

- **Merchants and developers:** open `/docs` in the running app. It covers merchant guides, the API reference and webhooks. The console's **Developer** page manages API keys and webhook endpoints.
- **Operators:** the [operations runbook](docs/operations.md) covers configuration, first deployment, scheduled jobs, alerts and incidents.
- **Pilots:** the [merchant pilot runbook](docs/pilot-runbook.md).
- **Development:** [local setup and verification](docs/development.md).

Payments accrue in the processor contract, and merchants withdraw manually. StackPay reports exact per-asset amounts and never shows fiat valuations. Subscriptions and automated payouts are not offered.

## Architecture

- `apps/web`: Next.js 15 (React 19) app router. It holds:
  - the merchant console and hosted checkout;
  - route handlers: `/api/v1` for integrations, and session routes for the console;
  - the Chainhook receiver and the job runner.
- `Supabase` (PostgreSQL via PostgREST, service role only): merchants, invoices, links, receipts, refunds, settlements, events, webhooks, API keys, idempotency and audit log. Financial state changes happen inside atomic SQL functions.
- `packages/contracts/stackpay`: Clarity contracts (`arch`, `proc`, and the proposed `direct` processor) and tests.
- `packages/sdk`: TypeScript SDK.
- `Stacks wallets`: merchant identity (signed sign-in challenge) and transaction signing. StackPay never holds keys.

## Monorepo Structure

- [`apps/web`](apps/web): web app, API routes, hosted payment surfaces
- [`packages/contracts/stackpay`](packages/contracts/stackpay): Clarity contracts and tests
- [`packages/sdk`](packages/sdk): TypeScript SDK for `/api/v1`
- [`packages/config`](packages/config): environment and network helpers
- [`supabase`](supabase): migrations and SQL tests (`supabase/tests`)
- [`scripts`](scripts): disposable-PostgreSQL test runner and the deployment evidence checker
- [`docs`](docs): runbooks, ADRs, audit, plan, and the Chainhook definition

## Merchant Flows

### Standard invoice

1. Merchant completes profile setup.
2. Merchant creates a standard invoice from [`/create-invoice`](apps/web/app/(app)/create-invoice/page.tsx).
3. Wallet submits `arch.create-invoice`.
4. Chain result returns the on-chain invoice id.
5. Only then does StackPay store the invoice in Supabase.
6. Customer pays from the hosted invoice page.
7. Payment confirmation creates a receipt and notification.

### MultiPay

`MultiPay` is a reusable public payment route.

- it does not expire like a standard invoice
- it uses one currency
- it supports either:
  - one fixed amount
  - up to 3 suggested amounts
- each customer payment generates a fresh on-chain invoice under the hood

Merchant management:

- create from [`/create-invoice`](apps/web/app/(app)/create-invoice/page.tsx)
- review all created MultiPay routes at [`/payment-links`](apps/web/app/(app)/payment-links/page.tsx)

### Universal QR

The universal QR route is a permanent public route for flexible real-world payments.

- customers choose asset
- customers choose amount
- the route remains stable
- managed from [`/qr-link`](apps/web/app/(app)/qr-link/page.tsx)

## On-Chain + Off-Chain Responsibilities

### On-chain

The `arch` + `proc` contracts (sources: `architecture.clar` / `processor.clar`) handle:

- canonical invoice ids
- public link ids
- invoice/payment state
- receipt ids
- `invoice-paid` events for Chainhooks

### Supabase

Supabase stores:

- merchant profiles
- settlement wallet metadata
- invoices and public links for dashboard/querying
- receipts
- activity events
- notifications
- the chain event inbox, merchant events and webhook deliveries
- refunds, API keys (hashes only), idempotency records and the audit log
- the contract deployment registry: each chain record's deployment

## Payment pipeline

1. A Hiro Chainhook watches the `arch` and `proc` contracts and posts to [`/api/webhooks/chainhooks`](apps/web/app/api/webhooks/chainhooks/route.ts). The sample definition is [`docs/stackpay-chainhook-invoice-paid.json`](docs/stackpay-chainhook-invoice-paid.json).
2. Events go into a durable inbox (`chain_event_inbox`) and are acknowledged. They are projected inline, and the job runner retries anything left over.
3. Projection is one SQL transaction that writes:
   - the invoice status change (a compare-and-set, so a stale event cannot overwrite a newer state);
   - the receipt;
   - activity, the in-app notification, and the merchant event.

   A rollback orphans the receipt and emits `invoice.payment_reverted`.
4. Merchant events fan out to webhook endpoints. Delivery is attempted right after the payment, refund or test event is recorded; the job runner retries failures.

Checkout also verifies the payment transaction directly, so a payment is recorded even if the Chainhook is late.

## Receipts

Paid invoices can generate receipt PDFs through:

- [`/api/receipts/[receiptId]/pdf`](apps/web/app/api/receipts/[receiptId]/pdf/route.ts)
- PDF generator lives in [`receipt-pdf.ts`](apps/web/lib/server/receipt-pdf.ts)

## Getting Started

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Run the tests:

```bash
npm run test:web        # web unit and route tests (vitest)
npm run test:contracts  # Clarity contracts (Clarinet simnet)
PG_BIN=/opt/homebrew/opt/postgresql@15/bin npm run test:db  # every migration + SQL suite on a disposable PostgreSQL 15
npm test -w @stackpay/sdk
```

## Supabase Setup

### Local Supabase

Copy envs:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Start local Supabase:

```bash
npm run supabase:start
```

Apply migrations:

```bash
npm run supabase:db:reset
```

Stop local Supabase:

```bash
npm run supabase:stop
```

### Remote Supabase

Authenticate and link:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Push migrations:

```bash
npm run supabase:db:push
```

After pushing, activate the contract deployment and schedule the job runner. See the [operations runbook](docs/operations.md).

## Required Environment Variables

See [`apps/web/.env.example`](apps/web/.env.example). The full list, with requirements, is in the [operations runbook](docs/operations.md#1-configuration). Production refuses to start without:

- `NEXT_PUBLIC_STACKS_NETWORK`
- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- `NEXT_PUBLIC_APP_URL` (the exact https origin; `STACKPAY_APP_ORIGIN` can override it on the server)
- the architecture, processor and token contract ids
- `STACKPAY_CHAINHOOK_SECRET`
- `STACKPAY_JOB_SECRET` (or `CRON_SECRET`)
- `STACKPAY_WEBHOOK_ENCRYPTION_KEY`

## Key Routes

Merchant console:
- `/dashboard`, `/create-invoice`, `/invoices` (refunds, CSV export)
- `/payment-links`, `/qr-link`, `/qr-link/counter`
- `/settlements`, `/developer`, `/profile`

Hosted checkout: `/pay/[invoiceId]`, `/pay/link/[slug]`.

Integration API (secret key):
- `/api/v1/invoices`, `/api/v1/payment-links`, `/api/v1/receipts`, `/api/v1/refunds`, `/api/v1/settlements`, `/api/v1/events`
- `/api/v1/webhook-endpoints`, `/api/v1/webhook-deliveries`, `/api/v1/reports/reconciliation`

The reference is in `/docs#api`.

Infrastructure:
- `/api/webhooks/chainhooks` (Chainhook secret)
- `/api/internal/jobs` and `/api/internal/metrics` (job secret)
- `/api/health` and `/api/health/ready` (public)

## Notes

- Recent dashboard activity is deduped server-side so a single invoice/link does not spam the feed.
- Notification sound is browser-dependent. Browsers may require prior user interaction before audio can play.

## Supporting Docs

- [`docs/stackpay-mvp-blueprint.md`](docs/stackpay-mvp-blueprint.md)
- [`docs/stackpay-supabase-mvp.md`](docs/stackpay-supabase-mvp.md)
- [`docs/stackpay-chainhook-invoice-paid.json`](docs/stackpay-chainhook-invoice-paid.json)
- [`docs/operations.md`](docs/operations.md) · [`docs/pilot-runbook.md`](docs/pilot-runbook.md) · [`docs/stackpay-deployment-registry.md`](docs/stackpay-deployment-registry.md)


## Creating Invoices with StackPay

### Objective

This SOP outlines the steps to create and manage invoices using the StackPay Bitcoin payment gateway.

### Key Steps

 

**1. Connect Your Wallet** [0:42](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=42)

![generated-image-at-00:00:42](https://loom.com/i/dd5e2d17d54e4bdfa80443ce5cd92de9?workflows_screenshot=true)

- Log in to your StackPay dashboard.
- Navigate to the wallet connection section.
- Select your wallet and confirm the connection.

 

**2. Set Up Your Profile** [1:03](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=63)

![generated-image-at-00:01:03](https://loom.com/i/1b14e42006184f5086ea4348f45b78bc?workflows_screenshot=true)

- Go to the profile settings.
- Enter your business name (e.g., Samuel Ventures).
- Set your display name (e.g., Sammy).
- Provide your invoice email address.
- Save your profile settings.

 

**3. Create an Invoice** [1:33](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=93)

![generated-image-at-00:01:33](https://loom.com/i/8baf1c50229d4988bf9c003350fa6662?workflows_screenshot=true)

- Click on the 'Create Invoice' button.
- Choose the type of payment (Standard or Multi-Pay).
- For a Standard Invoice: 
  - Enter the amount (e.g., 1 USDC).
  - Specify the customer’s email (e.g., Matt.searchme.com).
  - Set an expiration date for the invoice.
  - Describe the purpose of the payment (e.g., ebook).
- Click 'Generate Invoice' to create it.

 

**4. Share the Invoice** [2:37](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=157)

![generated-image-at-00:02:37](https://loom.com/i/c088e16675c841d6bf01a8787d8b4513?workflows_screenshot=true)

- After generating the invoice, you can view it.
- Copy the invoice link to share with the customer.

 

**5. Confirm Payment** [3:07](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=187)

![generated-image-at-00:03:07](https://loom.com/i/b8b5ea5199f8449ab6e175f6604f9275?workflows_screenshot=true)

- Once the customer pays, return to your dashboard.
- Check for payment notifications.
- Open the notification to confirm the payment has been received.

 

**6. Download Receipt** [3:33](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=213)

![generated-image-at-00:03:33](https://loom.com/i/fb6155d2d6d3461cb47944f6f6291beb?workflows_screenshot=true)

- Navigate to the receipts section.
- Find the relevant receipt for the completed transaction.
- Download or print the receipt as needed.

 

**7. Withdraw Funds** [4:08](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=248)

![generated-image-at-00:04:08](https://loom.com/i/7410b2f4b97542108d758d3eb30e4217?workflows_screenshot=true)

- Go to the funds withdrawal section.
- Specify the amount you wish to withdraw.
- Confirm the withdrawal request.

 

**8. Access QR Code** [4:37](https://loom.com/share/b2135bb5820046e7a6fb9736c520580a?t=277)

![generated-image-at-00:04:37](https://loom.com/i/35914b7569be4b7eb9ce98a4301ec0e4?workflows_screenshot=true)

- Locate the universal QR code in your dashboard.
- Click on it to view or share.

### Cautionary Notes

- Ensure that all wallet connections are secure to prevent unauthorized access.
- Double-check customer email addresses before sending invoices to avoid payment issues.

### Tips for Efficiency

- Regularly update your profile information to ensure accurate invoicing.
- Use the Multi-Pay option for recurring customers to simplify payment processes.
- Keep track of invoice expiration dates to manage follow-ups effectively.

### Link to Loom

<https://loom.com/share/b2135bb5820046e7a6fb9736c520580a>
## Security

Merchant access requires a signed wallet challenge and an audience-bound server session, which can be revoked on all devices. Every financial record is written only after the exact on-chain transaction has been verified. See [security rollout](docs/security-milestone.md) and the [audit](docs/stackpay-v2-audit.md). The contracts have not been independently audited, so this is not yet mainnet-ready.

## Reset testnet deployment

The prepared contract names are `arch` and `proc`. See the [reset testnet runbook](docs/testnet-redeployment.md) for verified token addresses, signing order, configuration and post-deployment checks. The contracts are deployed under `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN`; see [verified deployment evidence](docs/testnet-stackpay-deployment.json). Local configuration changes do not update the hosted app or Chainhook.
