# StackPay

StackPay is a Bitcoin-native payment gateway on Stacks for `sBTC`, `STX`, and `USDCx`. It combines on-chain invoices and payment routes with a merchant-facing Next.js console, Supabase-backed metadata, hosted checkout pages, receipts, and webhook-driven notifications.

## Current MVP

The current working MVP supports:

- merchant profile setup tied to a Stacks wallet
- standard invoices created on-chain, then stored in Supabase after confirmation
- `MultiPay` payment links for reusable fixed-price or suggested-price checkout
- a universal QR route that accepts `sBTC`, `STX`, and `USDCx`
- hosted payment pages
- processor-based payment confirmation
- receipt PDF generation
- Hiro Chainhook ingestion for `invoice-paid`
- in-app notifications with toast + sound
- dashboard metrics from real merchant invoice/link data

## Architecture

StackPay currently uses:

- `apps/web`: Next.js 14 app router app, route handlers, merchant console, hosted checkout
- `Supabase`: off-chain source of truth for merchants, invoices, payment links, receipts, notifications, and activity
- `packages/contracts/stackpay`: Clarity contracts and tests
- `Stacks wallets`: merchant identity and contract signing

There is still an `apps/api` scaffold in the repo, but the active MVP backend now lives in Next.js route handlers under [`apps/web/app/api`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/api).

## Monorepo Structure

- [`apps/web`](/Users/sam/Desktop/Stacks/Stackpay/apps/web): web app, API routes, hosted payment surfaces
- [`apps/api`](/Users/sam/Desktop/Stacks/Stackpay/apps/api): legacy API scaffold, not the active MVP backend
- [`packages/contracts/stackpay`](/Users/sam/Desktop/Stacks/Stackpay/packages/contracts/stackpay): Clarity contracts and tests
- [`packages/domain`](/Users/sam/Desktop/Stacks/Stackpay/packages/domain): shared business metadata
- [`packages/integrations`](/Users/sam/Desktop/Stacks/Stackpay/packages/integrations): integration/webhook manifests
- [`packages/sdk`](/Users/sam/Desktop/Stacks/Stackpay/packages/sdk): SDK scaffolding
- [`packages/ui`](/Users/sam/Desktop/Stacks/Stackpay/packages/ui): navigation metadata and shared UI config
- [`packages/config`](/Users/sam/Desktop/Stacks/Stackpay/packages/config): environment and network helpers
- [`supabase`](/Users/sam/Desktop/Stacks/Stackpay/supabase): Supabase config and migrations
- [`docs`](/Users/sam/Desktop/Stacks/Stackpay/docs): MVP notes, Chainhook config, integration docs

## Merchant Flows

### Standard invoice

1. Merchant completes profile setup.
2. Merchant creates a standard invoice from [`/create-invoice`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/(app)/create-invoice/page.tsx).
3. Wallet submits `architecture.create-invoice`.
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

- create from [`/create-invoice`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/(app)/create-invoice/page.tsx)
- review all created MultiPay routes at [`/payment-links`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/(app)/payment-links/page.tsx)

### Universal QR

The universal QR route is a permanent public route for flexible real-world payments.

- customers choose asset
- customers choose amount
- the route remains stable
- managed from [`/qr-link`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/(app)/qr-link/page.tsx)

## On-Chain + Off-Chain Responsibilities

### On-chain

The `architecture` + `processor` contracts handle:

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
- chainhook delivery state

## Notification Pipeline

Current payment notifications work like this:

1. Hiro Chainhook watches the deployed StackPay `architecture` contract.
2. On `invoice-paid`, Hiro posts to [`/api/webhooks/chainhooks`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/api/webhooks/chainhooks/route.ts).
3. StackPay confirms the invoice/receipt in Supabase.
4. A notification row is inserted.
5. The header bell and toast update from [`NotificationsButton.tsx`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/components/app/NotificationsButton.tsx).

The sample upload file is:

- [`docs/stackpay-chainhook-invoice-paid.json`](/Users/sam/Desktop/Stacks/Stackpay/docs/stackpay-chainhook-invoice-paid.json)

Email notifications are not implemented yet. The current pipeline is in-app only.

## Receipts

Paid invoices can generate receipt PDFs through:

- [`/api/receipts/[receiptId]/pdf`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/app/api/receipts/[receiptId]/pdf/route.ts)
- PDF generator lives in [`receipt-pdf.ts`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/lib/server/receipt-pdf.ts)

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

Run contract tests:

```bash
npm run test:contracts
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

If you switch from local to remote, make sure your remote DB actually has the current unique constraints used by `upsert`, especially on:

- `merchant_profiles.wallet_address`
- `merchant_wallets.wallet_address`
- `invoices.onchain_invoice_id`
- `notifications.source_key`
- `chainhook_events.delivery_key`

## Required Environment Variables

See [`apps/web/.env.example`](/Users/sam/Desktop/Stacks/Stackpay/apps/web/.env.example).

Important values:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_STACKS_NETWORK`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID`
- `NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID`
- `STACKPAY_CHAINHOOK_SECRET`
- `STACKPAY_STACKS_API_URL` (optional override)

## Key Routes

Merchant pages:

- `/dashboard`
- `/create-invoice`
- `/invoices`
- `/payment-links`
- `/qr-link`
- `/profile`

Hosted/public pages:

- `/pay/[invoiceId]`
- `/pay/link/[slug]`

Core API routes:

- `GET /api/merchant/profile`
- `POST /api/merchant/profile`
- `GET /api/invoices`
- `POST /api/invoices`
- `POST /api/invoices/confirm`
- `GET /api/payment-links`
- `POST /api/payment-links`
- `POST /api/payment-links/[paymentLinkId]/chain`
- `GET /api/payment-links/public/[slug]`
- `POST /api/payment-links/public/[slug]/invoices`
- `POST /api/payment-links/public/[slug]/invoices/confirm`
- `GET /api/qr-link`
- `POST /api/qr-link`
- `GET /api/notifications`
- `PATCH /api/notifications`
- `POST /api/webhooks/chainhooks`

## Notes

- The hosted merchant “open” actions now open in a new tab where appropriate.
- Recent dashboard activity is deduped server-side so a single invoice/link does not spam the feed.
- Notification sound is browser-dependent. Browsers may require prior user interaction before audio can play.

## Supporting Docs

- [`docs/stackpay-mvp-blueprint.md`](/Users/sam/Desktop/Stacks/Stackpay/docs/stackpay-mvp-blueprint.md)
- [`docs/stackpay-supabase-mvp.md`](/Users/sam/Desktop/Stacks/Stackpay/docs/stackpay-supabase-mvp.md)
- [`docs/stackpay-chainhook-invoice-paid.json`](/Users/sam/Desktop/Stacks/Stackpay/docs/stackpay-chainhook-invoice-paid.json)


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