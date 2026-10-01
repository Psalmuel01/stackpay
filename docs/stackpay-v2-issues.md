# StackPay v2 prioritized issues

Status as of 2026-09-30, branch `v2/core-infrastructure`. Each item keeps its original problem statement; the status line says what shipped, how it is tested, and what is still open.

GitHub-style backlog, stored locally; no GitHub issues created. Every checkbox is an acceptance gate, not a feature claim. File paths are repository-relative. See [audit](stackpay-v2-audit.md) for evidence and [execution plan](stackpay-v2-implementation.md) for dependencies.

## P0 — Before external v2 launch

- [x] **P0-01: Finish identity and public-data boundaries.** Problem: public invoice/confirmation/PDF responses expose contact data; verification does not independently recheck signed context; merchant GETs require redundant supplied identity. Impact: cross-merchant/customer privacy disclosure and ambiguous environment binding. Fix: explicit public DTOs, owner-authorized full receipts, context checks, shared JSON parser, session-derived GETs. Files: `apps/web/lib/server/wallet-auth.ts`, `stackpay-service.ts`, new public projection helper, `apps/web/app/api/**/route.ts`. Tests: valid/invalid/expired/reused challenge, changed domain/network/nonce, missing session, every merchant mutation, mismatched merchant, public JSON/PDF disclosure. Initial patch addresses these bounded changes; audience-scoped session migration/revoke-all/throttling still required.

  **Status (2026-09-30):** Done: allowlisted public DTOs and redacted public PDFs; signed-context revalidation; audience-bound sessions; revoke-all ("Sign out of all devices"); database-backed rate limits on auth and public routes. Tests: `session_hardening.sql`, `security.test.ts`, `public-privacy.test.ts`.

- [x] **P0-02: Durable and deterministic chain projection.** Problem: mixed batch phase, rollback no-op, processed marker before success, repeat activity, missing invoices acknowledged forever. Impact: falsely paid invoices, orphan receipts, lost events. Fix: deployment/block/event-scoped inbox, leases, atomic projection/outbox RPC, retries, CAS rollback/reapply rules. Files: Chainhook route, service `processChainhookInvoicePaidEvent`/`confirmInvoicePayment`, new migrations/worker. Tests: duplicate, concurrent duplicate, mixed apply/rollback, apply→rollback→reapply, crash at every write boundary, chain unavailable, missing invoice later recovered.

  **Status (2026-09-30):** Done: `chain_event_inbox` with leases, retries and dead letters; atomic `project_invoice_payment` / `revert_invoice_payment` with compare-and-set; rollback then reapply by event order. Tests: `chain_projection.sql`, `chain_projection_concurrency.sql` (real concurrent sessions), `chain-events.test.ts`.

- [x] **P0-03: Deployment registry and historical identity.** Problem: globally unique chain IDs and current-env verification. Impact: contract upgrades break checkout or collide records; wrong network explorer links. Fix: explicit network/architecture/processor/token deployment FK; scoped unique keys; evidence-backed backfill; original deployment on checkout/receipt. Files: migrations, contract builders, Stacks API, service, PDF renderer, sample Chainhook config. Tests: same chain ID in two deployments, retired deployment payment, mixed network rejection, old withdrawal availability.

  **Status (2026-09-30):** Done for the single-active-deployment stage: the verified testnet pair is registered; an append-only activation history; `deployment_id` stamped on every chain record and immutable once set; payment and checkout routed through the invoice's own deployment; readiness requires the configured pair to be active. Open: deployment-scoped uniqueness waits for a second registered pair, and the reviewed legacy backfill is still to do. See `stackpay-deployment-registry.md`.

- [x] **P0-04: Explicit state transitions and exact money.** Problem: read-then-expire races with paid updates; Number conversion; chain read failure becomes zero; static USD rates. Impact: incorrect state, balance, and reporting. Fix: atomic string units, bigint calculations, CAS transitions, unavailable state, remove fiat conversion for initial v2. Files: service, `stacks-api.ts`, `amounts.ts`, checkout, dashboard, settlement UI, schema. Tests: uint bounds, asset decimals, concurrent expiry/payment, precision round-trip, upstream failure, no static valuation, no negative balance.

  **Status (2026-09-30):** Done: exact decimal strings and bigint base units end to end; failed chain reads raise `chain_unavailable` instead of returning 0; guarded state transitions (`guard_invoice_transition`); static fiat rates removed.

- [x] **P0-05: Resolve contract trust and API-signing design.** Problem: owner-configured processor can mark payments; built-in processor remains authorized; API keys cannot sign merchant transactions; recipient differs from credited merchant. Impact: false security/settlement assumptions and impossible one-call API promises. Fix: ADR and adversarial simnet prototype, define direct settlement vs optional treasury ledger, explicit transaction authorization model. Files: both Clarity contracts, builders, contract tests, deployment manifests. Tests: unauthorized processor, forwarded admin/merchant calls, token mismatch/transfer failure, atomic rollback, duplicate/expired payments, unauthorized withdrawals, migration of old references. Independent review before mainnet.

  **Status (2026-09-30):** Done: [ADR 0001](adr/0001-settlement-model.md) chooses direct settlement by default and keeps `proc` for existing balances; the `direct` processor is prototyped with simnet tests; API invoices are drafts that the customer creates on-chain through the merchant's Universal link. Open: independent contract review, and deploying `direct`.

- [x] **P0-06: Versioned API with validation and keys.** Problem: only internal wallet-cookie routes and mock bearer keys exist. Impact: external integrations are unsafe/unusable. Fix: `/api/v1` schemas/errors/request IDs/pagination; hashed environment-scoped keys; scoped authorization, rotation/revoke/last-used/audit; keep externally disabled until idempotency. Files: new v1 routes and auth services, migrations, developer page, config. Tests: revoked/unknown key, test/live mismatch, denied scope, cross-merchant ID enumeration, malformed/oversized/deep metadata, pagination boundaries, secret redaction.

  **Status (2026-09-30):** Done: `/api/v1` with zod validation, typed errors with request ids, cursor pagination, hashed scoped keys bound to the environment, rotation with 24h grace, revocation, last-used tracking, and an audit log. Tests: `api-v1.test.ts`, `api-keys.test.ts`, `api_foundation.sql`.

- [x] **P0-07: Durable write idempotency.** Problem: retries can create duplicate resources/activity; no response replay. Impact: ambiguous timeouts and duplicate operations. Fix: database claim with unique merchant/environment/route/key, request hash, stored status/body, expiry policy. Files: new idempotency migration/service and v1 mutations. Tests: first request, timeout after commit, exact replay, body mismatch, concurrent retries, lease recovery, expired key, cross-merchant key reuse.

  **Status (2026-09-30):** Done: `idempotency_keys` unique per merchant, environment and key, with request hash, stored response, lease takeover, release on 5xx/409/429, and 24h expiry.

- [x] **P0-08: Signed outgoing webhook delivery.** Problem: schema scaffolding has no real delivery worker and plaintext signing-secret field. Impact: merchants cannot reliably fulfill orders. Fix: encrypted signing secrets, atomic outbox, HMAC raw body/timestamp, durable retries/DLQ, endpoint disablement, history/replay, SSRF-safe egress. Files: new webhook worker, endpoint/delivery API, migrations, SDK verifier. Tests: correct/wrong HMAC, replay window, redirect/DNS rebinding/private IPv4/IPv6 targets, restart mid-send, retry success, 429/500/410 policies, duplicate delivery semantics, revoked endpoint.

  **Status (2026-09-30):** Done: AES-256-GCM encrypted secrets; `t=,v1=` HMAC over timestamp and raw body; outbox fan-out trigger; leased delivery with retries at 1m, 5m, 30m and 2h, then dead-letter; 410 and repeated-failure disablement; replay and rotation; DNS-pinned SSRF-safe egress. Tests: `webhooks.test.ts`, `webhook_delivery.sql`.

- [x] **P0-09: Reconciliation and recovery.** Problem: closing checkout or failing Supabase loses records; no settlement event recovery. Impact: chain/database disagreements persist indefinitely. Fix: durable creation/payment/withdrawal scan cursors and exceptions queue; immutable correction audit; chain-derived repair. Files: new reconciler, inbox/projector, schema, status UI. Tests: lost confirmation, delayed indexing, missing receipt, rollback after export/delivery, interrupted cursor, repeated repair, no silent overwrite.

  **Status (2026-09-30):** Done: chain-derived repair. Creation and settlement events recover missing records, drafts attach from their on-chain description, missing invoices are retried, and events that keep failing are dead-lettered and visible in metrics. The reconciliation CSV and an append-only audit log are in place. Not built: a periodic full-chain scanner (replaying the Chainhook covers gaps).

- [x] **P0-10: Runtime/deployment safety.** Problem: prior critical/high dependency findings, no CI, unproven hosted grants/schema/backup, public config drift. Impact: insecure or unreproducible release. Fix: current dependency audit and compatible upgrade; CI builds/security/contracts/PostgreSQL tests; deployment manifest verification; live readiness; backup restore drill; production startup config validation. Files: package manifests/lock, Next config, Dockerfile, new CI, `.env.example`, migrations/runbooks. Tests: production cookies/HTTPS/origin, anon/authenticated DB role denial, unauthorized RPC execution, restored database, missing secret/config fails closed, artifact starts with intended network/contracts.

  **Status (2026-09-30):** Done: Next.js 15.5 / React 19 with 0 `npm audit` findings; CI jobs for web, SDK, contracts and PostgreSQL; production refuses to start with bad configuration; readiness probe. Needs the operator: apply migrations to the hosted database, a backup restore drill, and hosted RLS verification (see `operations.md`).

## P1 — Developer usability and merchant operations

- [x] **P1-01: Real TypeScript SDK.** Problem: private scaffold calls mock port 4000 with unknown result types. Impact: broken developer promise. Fix: typed v1 client, errors/request IDs, pagination, safe retries/idempotency, webhook helpers, examples, release packaging. Files: `packages/sdk/**`, docs, integration tests. Tests: actual v1 integration, timeout/cancellation, retry safety, error decoding, package import/types. Publish only after explicit release approval.

  **Status (2026-09-30):** Done: typed client, errors, pagination, automatic idempotency, retries, timeouts and webhook helpers; tests include integration against the real route handlers. Released on npm as `stackpay` under the MIT license.

- [x] **P1-02: Reconciliation metadata and CSV.** Problem: no complete order→payment→receipt→settlement export. Impact: bookkeeping/support friction. Fix: bounded metadata, correlation IDs and exact units, cursor-based CSV, formula escaping, correction status. Files: schema, v1 invoice/payment/receipt services, export route/UI. Tests: merchant isolation, atomic precision, large exports, spreadsheet formula injection, historical deployment, refunded/orphaned status when implemented.

  **Status (2026-09-30):** Done: CSV export correlating invoices, payments, receipts and refunds (`amount_refunded`), with exact units, formula-injection escaping and keyset streaming, from the console and `/api/v1/reports/reconciliation`.

- [x] **P1-03: Observability and operations.** Problem: payload suppression leaves little correlation; health only checks configuration. Impact: failures go undetected. Fix: allowlisted structured identifiers, latency/error counters, Chainhook/worker readiness, DLQ/stuck-payment alerts and incident runbook. Files: `http.ts`, health routes, worker/reconciler, telemetry adapter. Tests: request ID propagation, no secrets/PII, upstream timeout states, stale vs idle ingestion, alert thresholds.

  **Status (2026-09-30):** Done: request ids, redacted structured logs, `/api/health/ready`, `/api/internal/metrics` (JSON and Prometheus), alerts that separate idle from broken, heartbeats, and the [operations runbook](operations.md).

- [x] **P1-04: Retire misleading scaffolds.** Problem: mock API/developer keys/subscription/explorer behavior can be mistaken for real infrastructure. Impact: false integration behavior. Fix: label/disable simulations, extract formatting utilities, then remove unused provider/dependencies after import audit; archive old docs; update integration manifests. The separate mock API server has been removed; remaining scaffold work is still open. Files: `DemoProvider.tsx`, developer/subscriptions/explorer pages, packages/integrations/config/domain, README/docs. Tests: no active mock key or delivered claim, real checkout unchanged, SDK targets v1, production bundle excludes unused demo code.

  **Status (2026-09-30):** Done: DemoProvider, the mock pages and the unused `ui`, `domain` and `integrations` packages were removed; the Developer page is real; the SDK targets `/api/v1`.

- [ ] **P1-05: Merchant pilot protocol.** Problem: no evidence that three real merchants complete reliable flows. Impact: product differentiation remains hypothetical. Fix: authorized recruitment of 3–5 merchants; instrument integration friction, success, latency, webhook outcomes and retention; issue-driven followup. Files: pilot runbook/metrics plan and tested instrumentation. Tests/evidence: real order/tx/receipt correlation and merchant feedback, failure/recovery drill, no fabricated usage or public customer details.

  **Status (2026-09-30):** Prepared: the [pilot runbook](pilot-runbook.md) has recruiting, onboarding, metrics queries, a failure drill and exit criteria. Running the pilots needs real merchants and the team's outreach.

## P2 — After core reliability

- [x] **P2-01: Counter Mode and QR acceptance.** Problem: physical checkout lacks dedicated large-screen operational flow. Impact: missed opportunity for cafés/events. Fix: mobile/large-screen counter mode, presets, branded persistent QR, recent confirmed payments, accessible optional sound. Files: QR/checkout UI, notifications, profile schema. Tests: wallet reconnect, duplicate sound/event, offline recovery, amount/asset validation, confirmation before fulfillment.

  **Status (2026-09-30):** Done: Counter Mode with keypad, prefilled QR, a confirmed-payment feed, an optional chime and full screen.

- [x] **P2-02: MultiPay commerce options.** Problem: limited SKU/quantity/usage/expiry/redirect support. Impact: integration friction for repeated purchases. Fix: bounded metadata/SKU first; implement other options only with contract-enforced semantics and explicit URL rules. Files: link schema, v1/link service, Clarity if required, SDK/docs. Tests: max-use concurrency, quantity precision, expiry, redirect allowlist, one independent invoice per purchase.

  **Status (2026-09-30):** Done (bounded scope): link metadata such as a SKU, and the link id, are copied onto every purchase invoice; https `success_url` on invoices and links, with a visible, stoppable return. Not built: quantities, usage caps and link expiry. These need contract-enforced semantics.

- [x] **P2-03: Confirmed refunds.** Problem: no refund protocol or cumulative amount model. Impact: unsupported reversals. Fix: reviewed on-chain full/partial refund flow and ledger; no database-only refunded state. Files: contracts, migration, reconciler, API/SDK/events. Tests: refund total ≤ confirmed paid amount, duplicate/concurrent refund, wrong merchant, failed chain tx, reorg, receipt reconciliation.

  **Status (2026-09-30):** Done: refunds are transfers from the merchant's wallet to the original payer, capped by deny-mode post-conditions and tagged `SPR:<invoice>`. They are recorded only after verifying sender, recipient, asset, amount and memo on-chain. `record_refund` keeps the cumulative total within the paid amount under a row lock and is idempotent per transaction. `invoice.refunded` event; `/api/v1/refunds`; SDK. Known limit: a reorg of the refund transaction after it is recorded is not rolled back automatically.

- [ ] **P2-04: Subscription discovery only after pilots.** Problem: no validated subscription demand. Impact: distracts from developer wedge. Fix: gather demand and define safe collection authorization; do not ship mock recurring billing. Files: future ADR and contracts/API only after prioritization. Tests: collection consent, allowance/expiry, replay, insufficient balance, cancellation and retries before any launch.

  **Status (2026-09-30):** Not started, by design: waits for pilot evidence.
