# Merchant pilot runbook (P1-05)

For the team running StackPay's first merchant pilots. The goal is evidence that 3–5 real merchants can integrate StackPay and take payments reliably, measured rather than assumed. Record everything below from real activity only. Never fabricate usage, and never publish customer details.

## Entry criteria

Before inviting the first merchant, confirm all of the following:

- **Deployment health.**
  - The deployment passes the smoke test in the [operations runbook](operations.md) §2.
  - `/api/health/ready` has been 200 for 7 days.
  - The job runner runs every minute.
- **Network.** Pilots run on **testnet** first. Mainnet pilots need the independent contract review listed in the release gate of the [implementation plan](stackpay-v2-implementation.md).
- **Support.** A named person watches alerts during pilot hours, and there is a channel where merchants can reach you.
- **Consent.** Each merchant has agreed, in writing, to take part and to the metrics being collected.

## Recruiting (3–5 merchants)

Aim for a mix:

- at least one **API integrator**: an e-commerce or SaaS checkout using `/api/v1` or the SDK plus webhooks;
- at least one **no-code merchant**: invoices and MultiPay links from the console;
- at least one **in-person merchant**: Counter Mode at a café, event, or market stall.

Recruiting is outreach done by the team with the merchant's agreement. It is not automated, and no account is created on anyone's behalf.

## Onboarding script (per merchant, about 30 minutes)

1. Connect a wallet, sign in, and complete the profile.
2. Set up Universal QR. This is required for API invoices.
3. For integrators:
   - create a `sk_test_` key with only the scopes they need;
   - register a webhook endpoint;
   - send a test event;
   - walk through `invoice.paid` verification using the SDK README.
4. Make one real testnet payment end to end, then download the receipt and the reconciliation CSV.
5. Agree on a check-in schedule (day 1, day 7, day 14).

Record the start time and the time of the first successful payment (see *time to first payment* below).

## Metrics

Collect these from real activity. The source column says where each comes from, so no metric depends on the merchant's memory.

| Metric | Definition | Source |
| --- | --- | --- |
| Time to first payment | Onboarding start → first `invoice.paid` | Onboarding notes plus `merchant_events.created_at` |
| Payment success rate | `invoice.paid` / invoices that reached `pending` | `invoices` by status, per merchant |
| Confirmation latency | Payment transaction's block time → receipt recorded (median, p95) | `operational_metrics().payments.median_recording_lag_seconds`, plus a per-receipt query |
| Webhook success | First-attempt 2xx rate, and eventual success after retries | `webhook_deliveries` (`attempts`, `status`) |
| Dead letters | Chain events and webhook deliveries marked dead | `/api/internal/metrics` |
| Channel mix | API vs console vs link vs Counter Mode invoices | `invoices.creation_source` (`api`, `app`, `public_link`) |
| Refunds | Count and share of paid volume | `refunds` |
| Retention | Merchant took a payment in week 2 and week 3 | `merchant_events` by week |
| Integration friction | Every blocker, question, or workaround, with time lost | Check-in notes, filed as issues |

Example query, success rate per merchant over the pilot window:

```sql
select m.company_name,
       count(*) filter (where i.status in ('paid', 'refunded')) as paid,
       count(*) filter (where i.onchain_invoice_id is not null) as reached_chain
from invoices i join merchant_profiles m on m.id = i.merchant_id
where i.created_at >= :pilot_start
group by m.company_name;
```

## Failure and recovery drill (once per pilot)

With the merchant's knowledge, rehearse one failure on testnet and record how it went:

- **Webhook outage.** The merchant's endpoint returns 500 for 10 minutes. Expect retries at 1m and 5m, then eventual delivery; replay from Developer works.
- **Job runner paused** for 15 minutes. Expect the `jobs_not_running` alert, then full recovery once resumed, with no lost payments.
- **Ambiguous timeout.** Retry an `invoices.create` call with the same `Idempotency-Key`. Expect exactly one invoice.

## Exit criteria

The pilot counts as successful when **three merchants** each have:

- 14 days of use, with payments in at least two separate weeks;
- no payment recorded incorrectly (checked against the chain for every paid invoice);
- no event lost: every `invoice.paid` delivered, or visibly dead-lettered and then replayed.

In addition, every integration blocker must be triaged, with an issue and a decision.

## Reporting

For each merchant, write a short report. Use pseudonyms when shared outside the team. It covers:
- the metrics table above;
- the friction log;
- quotes the merchant agreed to share;
- a recommendation.

Link the combined findings from `docs/stackpay-v2-issues.md` (P1-05), and let what they show set the order of the P2 roadmap.
