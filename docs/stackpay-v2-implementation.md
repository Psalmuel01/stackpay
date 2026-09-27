# StackPay v2 implementation plan

Read [the audit](stackpay-v2-audit.md) and [prioritized issues](stackpay-v2-issues.md) first. Production readiness is gated by demonstrated behavior, not milestone names. Keep Standard, MultiPay, QR, receipts, exact chain verification, and existing withdrawal access. No subscriptions, visual redesign, or speculative accounting integrations in this phase.

## 0 — Audit, truth, and isolation

Deliver route/contract/schema/trust maps, record deployment evidence and unknowns, mark simulation as such, correct documentation links. Do not apply migrations, redeploy contracts, delete legacy directories, or publish packages as part of the audit. Establish CI and disposable database testing before relying on concurrency guarantees.

## 1 — Close the existing identity boundary (first implementation)

The nonce/session implementation is already present. Smallest correct patch:

1. Share JSON-object shape validation between challenge, verification, and merchant guard; preserve existing error envelope.
2. Revalidate signed challenge origin, network, wallet, and nonce against server context before consumption. Preserve database single-use/expiry transaction.
3. Make merchant GET identity session-derived without requiring caller wallet; retain mismatch rejection for old clients.
4. Restrict public checkout/confirmation/link DTOs to explicitly public fields. Public PDFs omit off-chain contact data; authenticated owning merchants retain full receipt details. Do not break customer payment availability by requiring merchant login.
5. Add real-signature cross-origin/context tests, all-route unauthenticated/mismatched-merchant tests, and public-data disclosure regressions.

Invariant: no caller wallet creates authority, and knowing a public on-chain identifier does not grant customer contact-data access. This patch needs no contract rewrite or new production migration. Audience-scoped sessions/revoke-all/global throttling follow with explicit schema migration and rollout tests.

## 2 — Correct chain projection and deployment identity

Prerequisite for external paid-event guarantees. Add deployment registry and scoped IDs; bind existing records with reviewed evidence, not current environment guesses. Introduce durable inbox and atomic payment projection (invoice, receipt/payment ledger, activity, outbox). Use CAS state transitions and event/block identities; independently process rollback then apply. Record reversals as audit events and define merchant correction notifications. Replay missing-record deliveries and reconcile chain creations/payments/withdrawals. Failure to fetch chain data must never produce success or a fabricated zero balance.

Gate: duplicate, apply→rollback→reapply, mixed batch, out-of-order delivery, expiry/payment race, and process-crash tests against real PostgreSQL transactions. Preserve historical checkout and withdrawal paths across deployments.

## 3 — API contract and signing ADR

Define OpenAPI/typed schemas, atomic-unit decimal strings, request IDs, errors, cursor pagination, metadata limits, URL policy, environment/deployment identity. Resolve invoice creation signing before promising one-call payable creation. Keep routes disabled to external callers until keys, scopes, and idempotency land.

Proposed initial `/api/v1` resources: invoices, payment-links, receipts, webhook-endpoints, webhook-deliveries, settlements. Keep internal handlers for compatibility, sharing domain services rather than duplicating business rules. Settlements initially read-only externally; no API-key authority to spend merchant funds.

## 4 — API keys + idempotency + explicit state machine

Develop together with the v1 routes, not after publicly exposing them. High-entropy `sk_test_`/`sk_live_` secrets revealed once; hashed storage, short identifier/prefix, scopes, environment enforcement, revocation, rotation, last-used tracking, and audit log. Scope grant ceilings and session-only key administration prevent escalation.

Use database uniqueness on merchant/environment/route/key, canonical request hash, in-progress claim/lease, bounded expiry, and persisted response/status. Exact retry replays; changed request returns conflict; concurrent requests cannot both create resources. Separate external idempotency keys from chain event deduplication.

Central transitions distinguish local draft, chain_pending, chain-confirmed pending, paid, expired, failed, and rollback/reconciliation evidence. Do not expose cancelled/refunded/partially_paid unless actual on-chain behavior is implemented. A database status must not imply a money movement.

## 5 — Durable outgoing merchant webhooks

Depends on atomic outbox and stable event schema. Store encrypted/recoverable HMAC signing keys using a managed encryption boundary (unlike API-key hashes, HMAC secrets must be recoverable to sign). Endpoint registration validates HTTPS, DNS/private address targets, ports, redirects, and connection destination to avoid SSRF/DNS rebinding. Apply egress restrictions and request time/size limits.

Immutable event ID + delivery ID, raw-body HMAC-SHA256 over documented timestamp/body bytes; constant-time verifier; replay window. Leased jobs resume after crash. Retry at 1m, 5m, 30m, 2h with jitter and bounded Retry-After handling; then dead-letter. Define 4xx/410 disablement vs retryable 429/5xx separately. Expose delivery history, manual replay, endpoint rotation, failure counts. Delivery is at-least-once; document merchant deduplication.

Only emit implemented events. Define correction semantics for a previously delivered paid event becoming orphaned; do not invent a refund for a chain rollback.

## 6 — Typed TypeScript SDK and developer docs

Depends on exercised v1 contract, keys, pagination, and idempotency. Replace scaffold after compatibility review. `secretKey`, typed models/errors, request IDs, environment/base URL, cursor iteration, abort/timeout behavior, and webhook verification helpers. Retry reads and explicitly idempotent writes only. Integration tests hit the real API with a disposable database and deterministic chain fixture; also test actual testnet flow.

Publishable package needs exports, declaration generation, packaging tests, versioning/release process, and examples. Publishing to npm requires explicit release approval. Do not advertise `npm install` as production-ready before release.

## 7 — Reconciliation, observability, and merchant operations

Immutable order/customer/cart metadata correlated with deployment, invoice, payment, txid, receipt, and settlement. CSV export with spreadsheet-formula injection protection, exact atomic values, timestamps, and correction status. Remove fixed fiat rates; add timestamped valuation only as a separate feature.

Readiness separately probes DB and chain; liveness stays cheap. Track API errors/latency, last Chainhook success, stuck syncs, confirmation latency, retries/DLQ, and exportable reconciliation exceptions. Alerts must distinguish no traffic from failed ingestion. Implement backup/restore rehearsal and incident runbooks.

## 8 — Contract decision and controlled merchant pilots

Direct-settlement vs optional processor ADR can be researched earlier but fund movement changes require separate deployment/test/migration review. No deletion of historical contracts or balances. Mainnet launch requires independent security review, dependency remediation, all P0 tests and recovery drills.

Recruit 3–5 merchants through separately authorized outreach. Observe integration time, payment success, median confirmation, webhook delivery/retry success, API vs dashboard usage, QR/link usage, failure reasons, and retention. Do not fabricate pilot evidence. Subscription/refund roadmap follows actual demand; refunds require confirmed on-chain transfers and cumulative amount invariants.

## Release gate

Do not call v2 production-ready until cryptographic identity, revocable keys, versioned API, idempotent writes, explicit states, duplicate safety, deterministic rollback, signed durable webhooks, visible failures, real SDK/API integration, no static fiat metrics, real backend integration tests, reconciliation, merchant isolation, and three successful real merchant flows are demonstrated. A green mocked suite or build alone cannot satisfy this gate.
