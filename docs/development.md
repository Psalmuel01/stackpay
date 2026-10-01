# Development guide

StackPay's application runs in [`apps/web`](../apps/web), with its active backend in [`apps/web/app/api`](../apps/web/app/api). No separate API server is required.

## Local setup

From the repository root:

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local
```

Do not overwrite an existing `.env.local`. Configure the network, contract IDs, token asset names, app origin, and database connection using the example file as a reference.

Choose one database:

- Local Supabase: start Docker, run `npm run supabase:start`, and use the local URL and server key reported by Supabase.
- Hosted Supabase: set `SUPABASE_URL` and the matching `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`. Keep server keys private. Apply the repository migrations to the selected project through your normal migration process.

`SUPABASE_URL` overrides `NEXT_PUBLIC_SUPABASE_URL` for server database requests. Public environment variables are embedded at build time. Restart the dev server after environment changes; rebuild deployed assets when public configuration changes.

```sh
npm run dev
```

Open `http://localhost:3000`. Use the same origin consistently for wallet sessions. Production requires `NEXT_PUBLIC_APP_URL` (or the server-only `STACKPAY_APP_ORIGIN`) to be the exact HTTPS origin; see the security rollout guide for the full checklist.

## Verification

```sh
npx tsc -p apps/web/tsconfig.json --noEmit --incremental false
npm run test:web                    # vitest: routes, services, security
npm test -w stackpay                # SDK unit tests
npm run test:contracts              # Clarinet simnet
PG_BIN=/opt/homebrew/opt/postgresql@15/bin npm run test:db   # all migrations + supabase/tests/*.sql on a throwaway PostgreSQL 15
npm run build
```

`test:db` needs a local PostgreSQL 15 (`brew install postgresql@15`; set `PG_BIN` to its `bin`). It creates a temporary cluster, stubs the Supabase roles, applies every migration in order, and runs each SQL suite in a rolled-back transaction, including real concurrent-session tests through `dblink`. CI runs the same four suites on every push.

To run a second dev server or a build next to a running one, give it its own output directory: `NEXT_DIST_DIR=.next-build npm run build`.

### What runs locally

Locally you get the full console, checkout, payments, refunds and API. Payments are recorded when the payer's checkout page confirms them. Two outside services can't reach `localhost`:
- **Chainhook:** Hiro can't call you, so a payment is only recorded if the checkout stays open until confirmation.
- **Scheduled job runner:** Supabase's cron can't call you, so run it yourself when you need retries or cleanup (command below).

If `.env.local` points at the same Supabase project as production, the two share data. Production's cron then processes the shared webhook queue, cannot reach `localhost` endpoints, and disables them after five failures. While testing webhooks locally, either pause the production cron ([operations](operations.md) §3), or use a separate database (`npm run supabase:start`). Afterwards, pause or delete `localhost` endpoints before resuming the cron.

For local webhook testing, run the demo receiver with `STACKPAY_WEBHOOK_SECRET=<endpoint secret> npm run webhook:listen` (it prints each event and verifies its signature) and register `http://localhost:4242/webhooks` in Developer. Allowing `http://localhost` needs `STACKPAY_ALLOW_LOCALHOST_WEBHOOKS=true` (development only; production refuses to start with it). Webhooks for payments, refunds and test events are sent immediately. Retries, unread-invoice expiry and cleanup run when you call the job runner, for example every minute from `apps/web`:

```sh
set -a && . ./.env.local && set +a
while true; do date +%T; curl -s -X POST -H "Authorization: Bearer $STACKPAY_JOB_SECRET" http://localhost:3000/api/internal/jobs; echo; sleep 60; done
```

For UI changes, review the homepage, docs, and merchant entry screen at desktop and narrow mobile widths. Check keyboard focus, navigation, documentation anchors, search with no results, and open menus. Authenticated payment flows also require real wallet testing on the configured network; a successful build does not verify extension behavior.

## Documentation ownership

- `/docs`: merchant workflows, refunds, the `/api/v1` reference, webhooks, troubleshooting, and current limitations.
- `packages/sdk/README.md`: SDK usage.
- `docs/operations.md`: deployment, jobs, monitoring, alerts, incidents.
- `docs/security-milestone.md`: rollout requirements and unresolved production blockers.
- API source in `apps/web/app/api`: authoritative request validation and response behavior.
- Contract source in `packages/contracts/stackpay`: authoritative on-chain behavior.

Keep claims aligned with implemented behavior. Label upcoming features explicitly. The SDK is published to npm as `stackpay`. Releases are described in `packages/sdk/README.md` § Releasing.

### Wallet transaction IDs

Wallet responses may contain a bare 64-character hexadecimal transaction hash. The wallet adapter and server confirmation lookup normalize valid hashes to lowercase with a `0x` prefix; malformed IDs are rejected before chain lookup. Contract, sender, arguments, and successful canonical transaction verification remain required before persisting confirmations.

If confirmation fails after a wallet broadcasts a transaction, check wallet activity before creating another invoice: a failed off-chain confirmation does not mean the transaction failed on-chain.
