# StackPay MVP Blueprint

> Historical planning document, not a statement of shipped features. See [v2 implementation plan](stackpay-v2-implementation.md) for the active roadmap.

## Current State
- `apps/web` is a strong visual shell, but most console routes are mock-data pages with no end-to-end flow behind them.
- `apps/api` was a placeholder and now contains a minimal scaffold, but it still needs persistence, auth, webhook signing, and indexer workers.
- `packages/contracts/stackpay` currently supports merchant registration, invoice creation, payment processing, receipts, and direct balance withdrawals.
- Shared business models, integration metadata, SDK structure, and config boundaries were missing and are now scaffolded under `packages/*`.

## Incomplete UI Flows

### 1. Merchant onboarding
- Missing: wallet-first onboarding, merchant profile creation, webhook verification, settlement wallet configuration, API key issuance.
- Current UI gap: `/profile` is a static settings form with no save path, no merchant record, and no payout destination model.

### 2. One-time invoice flow
- Missing: invoice creation form state, contract write, backend record, hosted payment page, payer checkout, receipt screen, invoice detail page.
- Current UI gap: `/create-invoice`, `/invoices`, and `/qr-link` describe the flow but stop before a generated invoice can actually be viewed or paid.
- Critical missing route: a public hosted payment surface such as `/pay/[invoiceId]`.

### 3. Invoice operations and explorer
- Missing: search backed by indexed invoice data, invoice detail timeline, receipt lookup, public verification path.
- Current UI gap: `/explorer` and `/invoices` are static lists with no live query path.

### 4. Subscription flow
- Missing: plan builder, subscriber enrollment, renewal scheduling, retry handling, delinquency state, cancellation flow.
- Important product constraint: a non-custodial MVP should not promise unattended wallet pulls. The practical MVP is recurring invoice generation plus reminder/retry orchestration.
- Current UI gap: `/subscriptions` shows plans but has no plan model, no customer state, and no renewal engine.

### 5. Settlement flow
- Missing: destination wallets, threshold rules, scheduled sweep policies, batch execution worker, settlement history, fee accounting.
- Current UI gap: `/settlements` renders example rules and history but there is no policy storage or execution path.

### 6. Developer flow
- Missing: API key management, webhook signing secret, event replay, request logs, docs generated from real endpoints, SDK examples that hit a working API.
- Current UI gap: `/developer` is static and disconnected from the backend.

## Contract Additions Needed
- Merchant registry metadata: merchant slug, settlement wallets, policy pointers, webhook preference hash, fee configuration.
- Public payment references: a contract-level mapping for reusable payment links or canonical invoice lookup data.
- Subscription primitives: plans, subscriber agreements, cadence, renewal invoice references, delinquency status.
- Settlement policy records: threshold rules, scheduled payout windows, split destinations, settlement run ids.
- Event surface: stable prints or indexing-friendly records for `invoice-created`, `invoice-paid`, `invoice-expired`, `subscription-renewal-created`, `settlement-executed`.
- Governance/admin controls: supported token registry updates, fee routing, processor rotation, and emergency pause behavior.

## Basic MVP Scope
- Merchant can connect a wallet and register as a merchant.
- Merchant can create a one-time invoice in sBTC, STX, or USDCx.
- StackPay generates a hosted payment link and QR code.
- Customer can open the hosted page and complete payment through the processor contract.
- Dashboard lists invoices and receipts from indexed chain data.
- Merchant can trigger manual settlement withdrawals and later add threshold-based automation.
- Backend exposes basic REST resources and webhook delivery for invoice lifecycle events.
- SDK wraps invoice, subscription, settlement, and webhook test endpoints.

## Integration Groundwork
- API resources: `/v1/invoices`, `/v1/subscriptions`, `/v1/settlements`, `/v1/webhooks/test`, `/v1/manifest`.
- Shared packages:
  - `@stackpay/domain`: product truth shared by web, API, SDK.
  - `@stackpay/integrations`: REST and webhook contract surface.
  - `@stackpay/sdk`: client entry point for app integrations.
  - `@stackpay/config`: API and network defaults.
  - `@stackpay/ui`: shared navigation and surface metadata.
- Next backend steps:
  - Add persistence for merchants, invoices, subscriptions, settlements, and webhook endpoints.
  - Add an indexer/worker that projects Clarity events into API storage.
  - Add hosted payment routes in the web app.
  - Add contract support for subscriptions and settlement policies once the MVP invoice flow is stable.
