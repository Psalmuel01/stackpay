# Deployment identity and rollout

## Status — 2026-09-28

This is the additive foundation for milestone 2, not completed deployment isolation. The new migration creates an empty, service-role-only registry. It does not change payment routes, remove existing uniqueness constraints, populate production data, or assign legacy invoices to the environment's current contracts. No hosted migration has been applied.

The configured testnet pair remains `ST13J1C3K69H3EDG2SVJ21SQ6GXD6A6F862QCK16D.arch7` / `.proc7`. On September 28, follow-up checks using curl successfully reached Hiro after Python/Node attempts failed:

- Both `/extended/v1/contract/<principal>` lookups returned HTTP 404, “cannot find contract by ID.”
- Both `/v2/contracts/source/<address>/<name>?proof=0` lookups returned HTTP 404, “No contract source data found.”
- `/v2/info` returned HTTP 200 and `is_fully_synced: true`.
- The configured deployer's `/extended/v1/address/<address>/transactions?limit=50` returned `total: 2`: one token transfer and one unrelated successful contract call, with no deployment transactions.
- Tracked deployment manifests contain only the simnet plan. Repository references found for arch1, arch6, arch7 and architecture use the same deployer; no alternate verified deployment was discovered.

The configured contracts are unavailable on the current queried testnet. This does not prove they never existed or establish whether a testnet reset occurred. There is no deployment transaction/source evidence here to register this pair. Resolve the deployment configuration or prepare a reviewed testnet deployment before live payment acceptance; do not backfill historical records from these environment values.

## Collecting evidence

From the repository root, using Node 22:

```sh
node --env-file=apps/web/.env.local scripts/check-contract-deployment.mjs
node --test scripts/check-contract-deployment.test.mjs
```

The checker uses fixed public Hiro origins for an explicitly supplied mainnet/testnet network. It requires checksum-valid contract addresses, rejects redirects, bounds requests at ten seconds, and fails if source or indexer evidence is missing. Its JSON includes source SHA-256 hashes and indexed deployment transaction IDs. It neither prints secrets nor writes to the database. `available: true` means those endpoints returned consistent identifiers; it does **not** prove canonical deployment, correct contract wiring, security, or token compatibility. Devnet verification requires a separate explicitly configured local workflow.

Before inserting a registry row, review canonical successful deployment transactions, compare their deployed source with the intended implementation, and inspect architecture processor authorization, processor architecture reference, token principals/asset names, and current admin configuration. Record the evidence and review rationale in `evidence_note`. The SQL constraints validate evidence shape, not blockchain truth. No seed row is supplied because the configured contracts remain unverified.

## Registry invariants

- Each UUID names one network and one reviewed architecture/processor pair, with deployment transaction IDs and exact source hashes.
- Registry identities cannot be updated or deleted by ordinary operations. The service role receives SELECT and INSERT only; anon/authenticated receive no table access. RLS adds a second boundary.
- An upgrade inserts a new pair and preserves the prior row. Testnet and mainnet cannot be substituted through a current environment default.
- A contract cannot be silently reused in a different pair on the same network. Rewiring a deployed architecture to a replacement processor is currently unsupported by this schema: it needs a separately reviewed configuration-epoch model, including balances and historical authorization. Do not overwrite evidence to accommodate it.
- There is deliberately no mutable global “active” flag yet. Enabling a deployment must be separate from preserving historical identity.

Database administrators can bypass these protections through DDL; this is an application integrity boundary, not an immutable external audit ledger.

## Remaining rollout, in dependency order

1. **Verify the live pair.** Obtain successful canonical deployment transactions and reviewed source. Resolve the current availability blocker before accepting real funds or declaring readiness.
2. **Inventory legacy records.** Export read-only invoice/link/receipt/settlement identifiers and their transaction IDs. Resolve each transaction against its network and called contract. Match event and invoice facts as well as IDs. Produce a reviewable backfill manifest; leave ambiguous or missing evidence unresolved. Never infer deployment from present env values or timestamps alone.
3. **Add nullable deployment foreign keys.** Bind invoice, payment link, receipt, settlement and chain event records through the reviewed manifest. Enforce immutable bindings and same-deployment parent/child relationships. Preserve existing global unique constraints during this compatibility stage.
4. **Route by stored identity.** Introduce stable database UUID public references. For old bare on-chain references, resolve uniquely or return an explicit conflict. Update server transaction verification, saved link intents, client payment contract/token post-conditions, receipt explorer URLs, Chainhook contract matching, and historical withdrawals together. Stored network chooses a trusted API origin; database URLs must not become arbitrary fetch targets. Public DTOs must continue excluding customer contact and arbitrary metadata.
5. **Switch all writes and uniqueness atomically.** Only after every caller is scoped, require deployment identity for new chain records and replace global on-chain uniqueness with deployment-scoped uniqueness. Test equal on-chain IDs across deployments without cross-reading, cross-writing or paying the wrong processor. Test legacy links and access to old processor balances after switching the active deployment.
6. **Durable projection.** Add inbox/lease/outbox transaction boundaries and deterministic rollback/reapply, then reconciliation. The registry alone cannot fix duplicate delivery, expiry races, or incomplete payment projections.

Do not drop global uniqueness early: existing unscoped readers and upserts would otherwise become ambiguous. Do not advertise historical routing as implemented until steps 3–5 pass integration tests.

## Validation

`supabase/tests/contract_deployments.sql` runs inside a rolled-back transaction on a disposable PostgreSQL database after migrations. It checks duplicate rejection, update/delete rejection, preservation of both old and new identities, and table privileges. The checker has separate Node tests for invalid network/address configuration, successful evidence collection, missing/malformed responses, unavailable upstreams and wrong indexer identifiers.

On September 28, all repository migrations applied successfully to a fresh local PostgreSQL 15 instance, with minimal Supabase auth-role stubs, and the registry SQL assertions passed. This verifies PostgreSQL schema behavior; it is not a hosted Supabase/RLS integration or a concurrency/payment test. All four checker tests passed. No payment runtime code changed.

## Reset follow-up

The user confirmed the testnet reset. Local configuration now targets the planned `.arch` / `.proc` pair; the earlier `.arch7` / `.proc7` observations above are historical. See the [redeployment runbook](testnet-redeployment.md). No pair is registered until deployment is confirmed.

## Deployment verified

On September 28 the user deployed `.arch` and `.proc` under `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN`. Both transactions are canonical/successful and both source files match exactly. See [evidence](testnet-stackpay-deployment.json). The old-address availability blocker is resolved for this new pair; hosted configuration, registry insertion, legacy binding and live smoke tests remain separate outstanding work. No hosted database writes were performed.

## Runtime binding — 2026-09-30

Migration `20261006090000_deployment_binding.sql` completes steps 3 and 4 of the rollout above and part of step 5:

- **Registered:** the verified testnet `.arch`/`.proc` pair, with its evidence (deploy transactions, source hashes). Registering does not activate it.
- **Activation:** an append-only `deployment_activations` history. `activate_contract_deployment(network, architecture, processor, note)` makes a registered pair the one new records bind to. Activating the active pair is a no-op. To activate the testnet pair after applying migrations, run as the service role:

  ```sql
  select public.activate_contract_deployment('testnet',
    'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch',
    'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc',
    'Testnet go-live');
  ```
- **Bindings:** `deployment_id` is added to invoices, payment links, receipts, settlement runs and chain events. It is stamped by trigger:
  - new invoices and links are stamped when they reach the chain (a draft is stamped when it is attached);
  - settlement runs are stamped on insert;
  - chain events bind to the deployment that owns the emitting contract;
  - receipts inherit their invoice's deployment, and cross-deployment receipts are rejected.

  A binding can never change once set. Legacy rows stay `NULL`; nothing is inferred from configuration.
- **Routing by stored identity:**
  - checkout pays, and the server verifies payments, through the invoice's own deployment's processor (falling back to configuration for unbound legacy invoices);
  - the Chainhook receiver accepts events from every registered contract on the network, so in-flight invoices on a previous pair still project after an upgrade.
- **Readiness:** `/api/health/ready` reports `deployment: false`, and the service is degraded, unless the configured contracts are the active registered deployment.

**Still deliberately open:**
- Deployment-scoped uniqueness (step 5): keep global on-chain uniqueness while a database has one active deployment. Switch only when a second pair is registered, together with scoped public references.
- The reviewed legacy backfill manifest (step 2).
- Withdrawals from a previous processor, once one exists.

Tests: `supabase/tests/deployment_binding.sql` and `apps/web/tests/operations.test.ts` ("deployment identity").
