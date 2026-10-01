# Operations runbook

For whoever deploys and keeps StackPay running. It covers configuration, the first deployment, scheduled jobs, monitoring, and what to do when an alert fires.

## 1. Configuration

In production the server **refuses to start** if any of these is missing or inconsistent. The check is in `apps/web/lib/server/config-check.ts`, and the error lists every problem at once.

| Variable | Requirement |
| --- | --- |
| `NEXT_PUBLIC_STACKS_NETWORK` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_SUPABASE_URL` (or the server-only `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | The project the migrations were applied to |
| `NEXT_PUBLIC_APP_URL` | The exact public `https://` origin, with no trailing slash. Wallet sign-in is bound to it. `STACKPAY_APP_ORIGIN` overrides it on the server and is rarely needed. |
| `NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID`, `NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID` | The deployed pair on this network. It must also be the **active** registered deployment (§2.3). |
| `NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID`, `NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID` and the matching `*_ASSET_NAME` | Token contracts for this network |
| `STACKPAY_CHAINHOOK_SECRET` | At least 32 characters; the same value is configured on the Chainhook |
| `STACKPAY_JOB_SECRET` (or `CRON_SECRET`) | At least 32 characters (`openssl rand -hex 32`); authorizes the job runner and the metrics endpoint. The scheduler must send the same value (§3). |
| `STACKPAY_WEBHOOK_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). It encrypts merchant webhook signing secrets. If you lose it, every endpoint must rotate its secret. |
| `STACKPAY_ALLOW_LOCALHOST_WEBHOOKS` | Must be unset in production (it is for local development only) |

Optional alert tuning, in minutes:

| Variable | Default |
| --- | --- |
| `STACKPAY_JOBS_STALE_MINUTES` | 10 |
| `STACKPAY_CHAIN_BACKLOG_MINUTES` | 15 |
| `STACKPAY_WEBHOOK_BACKLOG_MINUTES` | 180 |
| `STACKPAY_CHAINHOOK_STALE_MINUTES` | 0, meaning off. Chainhook only calls when a matching event happens, so silence is normal. |

## 2. First deployment and upgrades

1. **Migrations.** Run `npm run supabase:db:push`. Migrations are forward-only and additive. Before a hosted push, run them against a disposable database with `PG_BIN=… npm run test:db`.
2. **Environment.** Set every variable in §1, then deploy. If configuration is wrong, the deployment fails to start: read the listed problems and fix them.
3. **Activate the contract deployment** (once per database, and again after a contract upgrade). Run as the service role:

   ```sql
   select public.activate_contract_deployment('testnet',
     'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch',
     'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc',
     'Testnet go-live');
   ```

   The pair must already be registered with evidence (see [deployment registry](stackpay-deployment-registry.md)). Until it is active, `/api/health/ready` reports `deployment: false` and new chain records are left unbound.
4. **Chainhook.** Point the Chainhook's HTTP action at `https://<origin>/api/webhooks/chainhooks` with `Authorization: Bearer <STACKPAY_CHAINHOOK_SECRET>`, watching both contracts' `contract_log` (print) events, as in [the sample definition](stackpay-chainhook-invoice-paid.json).
5. **Scheduled jobs.** See §3.
6. **Smoke test** on testnet:
   - `GET /api/health/ready` returns 200;
   - sign in, create and pay an invoice;
   - the invoice shows Paid, a receipt exists, and a registered webhook endpoint receives `invoice.paid`.

## 3. Scheduled jobs

`/api/internal/jobs` does six things:
- retries chain events that failed to project;
- delivers due merchant webhooks, including retries;
- expires past-due invoices nobody has opened (reads also expire them) and emits `invoice.expired`;
- purges expired sessions, challenges and rate-limit rows;
- purges idempotency keys older than 24 hours;
- records a heartbeat.

Call it **every minute**. It is safe to call concurrently or late, because work is leased. The secret is `STACKPAY_JOB_SECRET` (generate one with `openssl rand -hex 32`); the runner also accepts `CRON_SECRET`.

### Option A: Supabase (`pg_cron` + `pg_net`)

This needs no paid hosting plan. Run it once in the Supabase SQL editor of the project the app uses. Keep it out of migrations, because the URL and secret differ per environment.

1. Enable the extensions (Dashboard → Database → Extensions, or):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   ```
2. Store the job secret in Vault, using the same value as `STACKPAY_JOB_SECRET` in the app's environment:
   ```sql
   select vault.create_secret('<STACKPAY_JOB_SECRET>', 'stackpay_job_secret');
   ```
   To change it later: `select vault.update_secret((select id from vault.secrets where name = 'stackpay_job_secret'), '<new secret>');`
3. Schedule the call:
   ```sql
   select cron.schedule(
     'stackpay-jobs',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://<origin>/api/internal/jobs',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stackpay_job_secret'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     );
     $$
   );
   ```
4. Verify after a few minutes:
   ```sql
   select status_code, created from net._http_response order by created desc limit 5;
   ```
   - `200` means it works.
   - `401` means the Vault secret does not match the app's `STACKPAY_JOB_SECRET`.
   - A `jobs_not_running` alert in `/api/internal/metrics` should clear.

To stop it: `select cron.unschedule('stackpay-jobs');`. The scheduler can only reach a public URL, not `localhost`.

### Option B: other schedulers
- **Vercel Pro:** add a cron for `/api/internal/jobs` with schedule `* * * * *`. Vercel sends `CRON_SECRET` automatically. (Hobby plans allow only daily crons, which is not enough.)
- **Anything else** (an external cron service, a GitHub Actions schedule): `curl -fsS -X POST -H "Authorization: Bearer $STACKPAY_JOB_SECRET" https://<origin>/api/internal/jobs`.

If jobs stop, payments are still recorded, because the Chainhook receiver and checkout process them inline. However:
- retries and webhook delivery stall;
- unread invoices are not expired;
- the `jobs_not_running` alert fires after 10 minutes.

## 4. Monitoring

| Endpoint | Auth | Use |
| --- | --- | --- |
| `GET /api/health` | none | Liveness only. Never touches dependencies. |
| `GET /api/health/ready` | none | 200 when the database and Stacks API respond and the configured contracts are the active deployment; 503 otherwise. Returns only booleans. |
| `GET /api/internal/metrics` | job secret | JSON snapshot with alerts. |
| `GET /api/internal/metrics?format=prometheus` | job secret | Prometheus gauges |

Point an uptime checker at `/api/health/ready`. Scrape or poll the metrics endpoint every minute and page on `critical` alerts.

Logs are single-line JSON (`lib/server/log.ts`) with secrets and personal data redacted. Every API error response carries a `request_id`. Search logs for it when a merchant reports a problem.

## 5. Alerts and what to do

| Alert | Severity | Meaning | Action |
| --- | --- | --- | --- |
| `jobs_not_running` | critical | No job heartbeat within the window | Check the scheduler and its secret. Call `/api/internal/jobs` by hand and read the response. |
| `chain_backlog` | critical | Chain events have waited more than 15 minutes | Usually the Stacks API or the database is down: check `/api/health/ready`. Events retry automatically (up to 12 attempts with backoff) once the dependency recovers. |
| `chain_dead_letters` | warning | Events exhausted their retries | Inspect them with `select * from chain_event_inbox where status = 'dead'`. Common cause: an invoice the chain knows but the database never recorded. After fixing the cause, requeue: `update chain_event_inbox set status = 'pending', attempts = 0, next_attempt_at = now() where id = …`. |
| `webhook_backlog` | warning | Deliveries pending more than 3 hours | Check for slow or failing merchant endpoints in `webhook_deliveries`. Nothing is lost; deliveries continue retrying. |
| `webhook_dead_letters` | warning | Deliveries exhausted their retries in the last 24 hours | The merchant's endpoint is failing. They can replay from Developer once it is fixed. |
| `stale_pending_invoices` | warning | Invoices past expiry are still pending | The job runner is not running (see `jobs_not_running`). |
| `chainhook_silent` | warning | No Chainhook delivery within the configured window (only if configured) | Check the Chainhook's status and secret in the Hiro platform. |

## 6. Incidents

**A customer paid, but the invoice shows pending.**
1. Look up the transaction on the explorer for the configured network.
2. If it failed or aborted, nothing was paid.
3. If it succeeded, check `chain_event_inbox` for its `tx_id`. If the row is missing, the Chainhook did not deliver: check the Chainhook.
4. To record the payment now, submit it for verification:

   ```sh
   curl -X POST https://<origin>/api/invoices/<invoice>/payment \
     -H 'Content-Type: application/json' \
     -d '{"txId":"0x…"}'
   ```

   The server verifies the transaction on-chain and records it idempotently.
5. Never mark an invoice paid by hand.

**Blockchain reorganization.**
- A rollback event orphans the receipt and returns the invoice to pending or expired.
- It also sends `invoice.payment_reverted`, and merchants should pause fulfilment.
- If the transaction lands again, it is re-applied and `invoice.paid` is sent again.
- Refunds already recorded stay recorded.

**Leaked secret.**
- Chainhook secret: rotate it in the environment and on the Chainhook together.
- Job secret: rotate it in the environment and in the scheduler.
- Webhook encryption key: set a new key and ask every merchant to rotate their endpoint secrets. Old ciphertexts become unreadable, and the affected endpoints fail until they are rotated.
- A merchant's API key: the merchant revokes it in Developer. Every use is recorded in `audit_log`.

**Database restore.** Chain truth is on-chain, so after a restore:
1. Replay the Chainhook for the missing block range (from the Hiro platform).
2. Let the inbox re-project. Projection is idempotent, so replays are safe.

Rehearse this on a copy before relying on it.

## 7. Routine checks (weekly)

- Dead letters: `chain_event_inbox` rows with `status = 'dead'`, and `webhook_deliveries` rows with `status = 'dead'`.
- Readiness history from the uptime checker.
- `npm audit` and dependency updates. CI runs web, SDK, contract and database tests on every push.
