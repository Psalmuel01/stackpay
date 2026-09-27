# Wallet authentication and verified confirmations

This milestone hardens the existing MVP. It does not establish mainnet readiness.

## Implemented

- Merchant APIs require an opaque, eight-hour server session. The wallet address is derived from that session; a conflicting supplied address is rejected.
- A wallet signs a five-minute challenge containing the app origin, network, wallet, timestamp, and random nonce. The signature public key must derive to the requested single-signature wallet address.
- PostgreSQL consumes each challenge and creates its session atomically. Challenge issuance is limited to ten per wallet per minute. Sessions are stored as SHA-256 token hashes; cookies are HttpOnly, SameSite=Strict, and Secure with a `__Host-` prefix in production. Logout deletes the server session. Mutations require the configured Origin.
- Merchant pages show a sign-in gate. Public invoice and payment-link checkout remain available without a merchant session.
- Invoice, public-invoice, payment-link, payment, and withdrawal confirmations verify a canonical, anchored transaction from the configured Stacks API. Checks include transaction id, type, contract, function, sender where applicable, every serialized Clarity argument, and the successful Clarity result. Withdrawal results must contain the expected amount and recipient. Payment payer identity comes from the chain response.
- Payment-link confirmation checks merchant ownership and the saved creation intent. Client-supplied on-chain link ids cannot bypass verification. Pending transactions do not update links.
- Invoice-creation replay cannot overwrite an existing invoice or reset a paid invoice. A conflicting transaction or merchant produces a conflict response.
- Payment and withdrawal requests use Deny post-condition mode with exact asset and amount conditions. Withdrawal conditions constrain the processor principal; payment conditions constrain the payer. Tokens require explicit asset names.
- Amount-to-atomic-unit conversion uses decimal parsing and integer arithmetic, rejects excess precision, and rejects unsafe numeric input. Existing dashboard calculations and balance display still use numbers and require the separate accounting milestone.
- Chainhook requests are rejected when the shared secret is missing or wrong. Apply events are independently transaction-verified before marking an invoice paid. Transaction response logs no longer include financial/customer payloads.

## Rollout requirements

1. Apply `supabase/migrations/20260926090000_wallet_sessions.sql` to **staging first** using the normal migration process. The migration was tested in a disposable PostgreSQL instance; it has not been applied to a connected database by this change.
2. Set `STACKPAY_APP_ORIGIN` to the exact HTTPS origin used by the merchant app (for example, `https://payments.example.com`). `NEXT_PUBLIC_APP_URL` is the fallback. Production sign-in fails closed without a configured origin. Preview environments need their own configured origin and HTTPS.
3. Set a strong random `STACKPAY_CHAINHOOK_SECRET` and configure the sender with the same value. Missing secrets now reject all deliveries, including in development.
4. Set `NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME` and `NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME` to the **Clarity fungible-token asset names declared by the configured contracts**. These are not necessarily the contract name or display ticker. Token payments and withdrawals deliberately refuse to submit without them. Check the asset identifiers on-chain rather than guessing.
5. Confirm `NEXT_PUBLIC_STACKS_NETWORK`, both StackPay contract ids, both token contract ids, and `STACKPAY_STACKS_API_URL` refer to the intended deployment/network. Public environment values must be supplied at **build time**, including for Docker builds; a runtime-only variable does not update an already built browser bundle.
6. On HTTPS staging, connect a supported single-signature wallet, sign in, reload, sign out, and verify the revoked cookie no longer authorizes requests. Test cancellation, wallet switching, and session expiry. Exercise standard invoices, MultiPay, Universal QR, all enabled token payments, and withdrawals with small testnet amounts.
7. Schedule deletion of expired `wallet_sessions` and old `wallet_auth_challenges` rows using the deployment's database maintenance process. Enforce request size limits and broader IP/account rate limits at ingress. The per-wallet challenge limit is not a complete abuse prevention system.

No production database migration, deployment, push, or wallet transaction was performed as part of this implementation.

## Validation

From the repository root:

```sh
npm run -w @stackpay/web test:security
npx tsc -p apps/web/tsconfig.json --noEmit --incremental false
npm run test:contracts
npm run build:web
```

`supabase/tests/wallet_sessions.sql` verifies consumption, replay rejection, expiry, issuance rate limiting, and role privileges. Run it on a disposable database after the migration, using `psql -v ON_ERROR_STOP=1 -f supabase/tests/wallet_sessions.sql`; test writes roll back. An additional simultaneous two-session PostgreSQL consumption test was run during implementation and yielded exactly one successful consumer.

Final local results: 55 API/security tests, six existing contract tests, TypeScript checks, and the production build passed. The signed-out merchant gate was also inspected in the browser.

The API tests use mocked database/Stacks responses and real signature cryptography. They do not replace staging tests with a real browser wallet and deployed contracts.

## Remaining release blockers

- Next.js was advanced from 14.2.5 to 14.2.35 and compatible transitive dependency fixes were applied. The current npm audit still reports one critical Next.js finding and one high finding in its bundled PostCSS. The audit recommends Next.js 16.3.6, a breaking framework upgrade. Complete that migration and repeat validation before release; this patch update alone does not resolve the framework security backlog.
- Durable webhook retries, missing-record repair, separate apply/rollback processing, actual rollback reversal, and periodic chain reconciliation remain unfinished. A successful canonical transaction check is not a finality/reorg guarantee.
- Historical deployment scoping remains incomplete in this checkout. Confirmation uses the currently configured contracts; it does not establish a deployment registry or repair historical records.
- Exact arithmetic throughout balances/accounting, trustworthy USD valuation, public receipt/customer-data access review, operational monitoring, backup/restore validation, and independent contract review remain required.
- Contracts are unchanged. Existing six contract tests cover only a small part of the required security matrix. Mainnet deployment/configuration also needs a separate review of the hardcoded token principals in the processor contract.

Wallet connection troubleshooting:
- The connector uses explicit Leather/Xverse providers and retains the selected provider for signing and transactions. Existing browser connections must reconnect after this update.
- Set server-only `SUPABASE_URL` to the hosted project's URL and `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` to that same project's server key. `SUPABASE_URL` overrides the build-time public URL. Restart/redeploy after changing server configuration; never expose these keys as public variables.
- A localhost Supabase URL requires a running local Supabase instance. Applying SQL to a hosted project does not change the app's database configuration.
- If the migration was applied manually, verify its tables, functions, and privileges before reconciling CLI migration history; do not blindly rerun the table-creation migration.
- Automated provider-routing tests do not replace testing both actual browser extensions on HTTPS staging.
