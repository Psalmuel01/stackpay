# StackPay Supabase MVP

> Historical MVP notes. See [v2 audit](stackpay-v2-audit.md) for current authorization, deployment, and reliability gaps.

## Architecture

StackPay MVP now uses:

- `Next.js` app and route handlers for merchant-facing backend logic
- `Supabase` as the off-chain system of record for merchant profiles, invoices, payment links, receipts, subscriptions, and webhook metadata
- `Stacks wallets` for merchant identity and transaction signing
- `Clarity contracts` for canonical invoice and payment-link state

## Data Flow

### Merchant profile

1. Merchant connects a Stacks wallet in the browser.
2. Frontend posts wallet-linked metadata to `POST /api/merchant/profile`.
3. Route handler upserts `merchant_profiles` and `merchant_wallets` in Supabase.
4. Merchant profile is now queryable by wallet address.

### Standard invoice

1. Frontend posts invoice metadata to `POST /api/invoices`.
2. Route handler stores a draft invoice row in Supabase with status `pending_signature`.
3. Route handler returns a contract intent for `architecture.create-invoice`.
4. Wallet client broadcasts the contract call.
5. Frontend posts `txId` and returned on-chain invoice id to `POST /api/invoices/:invoiceId/chain`.
6. Supabase now has both merchant metadata and chain references for reconciliation.

### MultiPay / Universal QR

1. Frontend posts link metadata to `POST /api/payment-links` or `POST /api/qr-link`.
2. Route handler stores a draft payment-link row in Supabase.
3. Route handler returns the relevant contract intent.
4. Wallet broadcasts the link creation call.
5. Frontend confirms with `POST /api/payment-links/:paymentLinkId/chain`.

## Supabase Layout

Schema lives under:

- [supabase/config.toml](../supabase/config.toml)
- [supabase/migrations/20250901120000_init_stackpay.sql](../supabase/migrations/20250901120000_init_stackpay.sql)

Core tables:

- `merchant_profiles`
- `merchant_wallets`
- `wallet_challenges`
- `invoices`
- `payment_links`
- `subscription_plans`
- `subscriptions`
- `receipts`
- `webhook_endpoints`
- `webhook_deliveries`
- `activity_events`
- `chain_sync_state`

## Local Setup

Copy the app env file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Start local Supabase:

```bash
npm run supabase:start
```

Apply local migrations from this repo:

```bash
npm run supabase:db:reset
```

Start the Next.js app:

```bash
npm run dev
```

## Remote Setup

Authenticate and link your Supabase project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Push migrations:

```bash
npm run supabase:db:push
```

## Required Env Vars

Web app:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_STACKS_NETWORK`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `STACKPAY_STACKS_API_URL` (optional override for tx result polling)

## Current API Routes

- `GET /api/health`
- `GET /api/merchant/profile?walletAddress=...`
- `POST /api/merchant/profile`
- `GET /api/invoices?walletAddress=...`
- `POST /api/invoices`
- `POST /api/invoices/:invoiceId/chain`
- `GET /api/payment-links?walletAddress=...`
- `POST /api/payment-links`
- `POST /api/payment-links/:paymentLinkId/chain`
- `GET /api/qr-link?walletAddress=...`
- `POST /api/qr-link`

## Important MVP Notes

- Wallet ownership is still the intended merchant identity anchor.
- The current routes store metadata by wallet address but do not yet enforce a verified wallet challenge session.
- Contract intents are returned as structured payloads. The frontend wallet client still needs to convert these into Clarity values and broadcast them.
- The next backend step after this scaffold is an indexer or reconciliation worker that reads chain events and marks invoices paid, inserts receipts, and drives webhook delivery.
