# ADR 0001 — Settlement model: direct settlement by default, processor kept for existing balances

- Status: Accepted for v2 design; contract change **not deployed** (requires independent review)
- Date: 2026-10-01
- Issue: P0-05 in [stackpay-v2-issues.md](../stackpay-v2-issues.md)

## Context

StackPay currently settles through a processor contract (`proc`):

```text
customer ──transfer──▶ proc (pooled balance, per merchant/currency)
merchant ──withdraw──▶ proc ──transfer──▶ destination wallet
```

The audit found that the processor's only material feature is delayed, manual withdrawal to a
chosen destination. There is no batching, split routing, fee abstraction, conversion, or
scheduled payout. In exchange it adds:

- custody: customer funds sit in a contract StackPay operates, so merchants must trust that
  contract and its upgrade path;
- a second, merchant-paid transaction to receive funds;
- a ledger that must be reconciled against chain state, plus a withdrawal liveness dependency;
- extra failure modes (lost withdrawal confirmations, balance read failures) and accounting surface.

The architecture contract's owner can also install any principal as a payment processor via
`set-processor`, while the built-in `.proc` stays authorized. That admin power is part of the
trust model under either option.

The competing product settles customer → merchant directly.

## Decision

1. **Default for the next contract version: direct settlement.** A processor transfers the
   payer's funds to the invoice's `recipient` in the same transaction that marks the invoice paid.
   It keeps no balances and has no withdrawal path. Prototype: `contracts/direct-processor.clar`,
   tested on simnet in `tests/direct-processor.test.ts`.
2. **Keep `proc` for existing deployments.** Balances held by deployed processors must remain
   withdrawable indefinitely. Old invoices keep their deployment identity; checkout for them
   continues to target the processor they were created under.
3. **Re-introduce pooled settlement only for a concrete product need** validated with pilot
   merchants — for example split settlements, treasury routing, or batching — and then as an
   explicit, opt-in feature with its own contract review, not as the default path.
4. **Consolidated reconciliation does not require custody.** StackPay's receipts, merchant events,
   and CSV exports reconcile directly settled payments as well as pooled ones.

## How the prototype behaves

- Invoice status and expiry are checked (via `arch.process-payment`) before any transfer. If the
  transfer then fails, Clarity aborts the whole transaction, so an invoice is never marked paid
  without payment (see the "rolls back the payment state" test).
- Funds go to the invoice's stored `recipient`. This also closes an audit finding: under `proc`
  the stored recipient was not the party credited, which the UI and docs had to explain.
- SIP-010 payments are restricted to the allowlisted sBTC and USDCx principals.
- The processor holds nothing: its STX and token balances stay zero in tests.

## Consequences

Positive:

- No custody or pooled balances; merchants receive funds in the payment transaction itself.
- One fewer transaction and no withdrawal step for merchants; the settlements page becomes a
  view of historical processor withdrawals only.
- Less state to reconcile, fewer failure modes, smaller accounting surface.

Negative / to handle:

- Refunds cannot be paid from a pooled balance; they must be a separate merchant-signed transfer
  recorded against the original payment (see P2-03). This matches the brief's requirement that a
  refund is a real money movement.
- The recipient address is fixed at invoice creation. Merchants who change their payout wallet
  affect only new invoices.
- Platform fees, if ever introduced, need an explicit split in the payment transaction.

## Rollout (not performed by this change)

1. Independent review of `direct-processor.clar` and the architecture authorization model,
   including forwarded-call and trait-substitution cases.
2. Deploy `direct` alongside the existing contracts, record it in `contract_deployments` with
   verified source hashes, and call `set-processor` from the architecture owner.
3. Build checkout intents per invoice deployment: new invoices target `direct`; existing invoices
   keep targeting the processor they were created with.
4. Keep `proc` withdrawals available and visible in the console for as long as any balance remains.
5. Subscribe the Chainhook predicate to the new contract.

No mainnet or testnet transaction, contract deployment, or processor change was made as part of
this decision.
