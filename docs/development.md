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

Open `http://localhost:3000`. Use the same origin consistently for wallet sessions. Production requires an exact HTTPS `STACKPAY_APP_ORIGIN`; see the security rollout guide for the full checklist.

## Verification

```sh
npx tsc -p apps/web/tsconfig.json --noEmit --incremental false
npm run -w @stackpay/web test:security
npm run build
npm run test:contracts
```

Stop the development server before running a production build; both use the Next.js output directory.

For UI changes, review the homepage, docs, and merchant entry screen at desktop and narrow mobile widths. Check keyboard focus, navigation, documentation anchors, search with no results, and open menus. Authenticated payment flows also require real wallet testing on the configured network; a successful build does not verify extension behavior.

## Documentation ownership

- `/docs`: merchant workflows, wallet authentication, core API routes, troubleshooting, and current limitations.
- `docs/security-milestone.md`: rollout requirements and unresolved production blockers.
- API source in `apps/web/app/api`: authoritative request validation and response behavior.
- Contract source in `packages/contracts/stackpay`: authoritative on-chain behavior.

Keep claims aligned with implemented behavior. Label upcoming features explicitly. Do not publish SDK installation or API-key examples until that integration surface is supported.

### Wallet transaction IDs

Wallet responses may contain a bare 64-character hexadecimal transaction hash. The wallet adapter and server confirmation lookup normalize valid hashes to lowercase with a `0x` prefix; malformed IDs are rejected before chain lookup. Contract, sender, arguments, and successful canonical transaction verification remain required before persisting confirmations.

If confirmation fails after a wallet broadcasts a transaction, check wallet activity before creating another invoice: a failed off-chain confirmation does not mean the transaction failed on-chain.
