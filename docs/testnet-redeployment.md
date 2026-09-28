# Reset testnet deployment — arch / proc

Deployed by the user and verified September 28, 2026. **Both contracts are canonical and successful; deployed source matches the repository exactly.** See [deployment evidence](testnet-stackpay-deployment.json). This is a testnet-only configuration. Public IDs in the local environment now point at the new names; restart/rebuild the app after deployment before testing checkout. The hosted app/environment and hosted Chainhook configuration have not been changed.

## Verified token dependencies

| Token | Contract | Transfer asset | Decimals |
| --- | --- | --- | --- |
| sBTC | `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token` | `sbtc-token` | 8 |
| USDCx | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` | `usdcx-token` | 6 |

Sources: [Stacks network documentation](https://docs.stacks.co/learn/network-fundamentals/mainnet-and-testnets) and [USDCx contracts](https://docs.stacks.co/learn/bridging/usdcx/contracts). Both deployments were independently checked as canonical and successful using Hiro's current testnet API; hashes/transaction IDs are in [token evidence](testnet-token-evidence.json). The previous sBTC principal returns 404. Both current token ABIs match the processor's SIP-010 transfer trait. sBTC also defines a separate locked asset; payment post-conditions must name `sbtc-token`, not the locked token.

## Prepared contracts

Deployer: `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN`.

1. Publish `contracts/architecture.clar` as **arch**, Clarity 4.
2. Wait for successful canonical confirmation.
3. Publish `contracts/processor.clar` as **proc**, Clarity 4, from the **same wallet**.
4. Wait for successful canonical confirmation.

Both names are now deployed. Do not rerun deployment with these names on this network. The processor now refers to `.arch`; the architecture authorizes `.proc` directly. An additional `set-processor` transaction is not required for this pair. The owner-controlled alternate processor option remains existing behavior and still needs the security review described in the audit.

The [testnet plan](../packages/contracts/stackpay/deployments/default.testnet-plan.yaml) records the user’s completed deployment. The user-generated deployment plan records costs of 169,130 and 60,740 micro-STX; the transaction evidence is authoritative for the completed deployment. Review current wallet estimates before signing. The manifest pins Clarity 4 / epoch 3.3 instead of `latest`; these contracts use Clarity 4 features and were checked with Clarinet 3.23.1.

## Signing with your wallet

Use the [Hiro testnet deployment sandbox](https://explorer.hiro.so/sandbox/deploy?chain=testnet), connected to the deployer above. Load the two source files in the order specified, enter the exact contract names, select Clarity 4, and review/sign each deployment. Do not use the simulator's funded account as the live deployer.

The user completed deployment through their local setup. Signing settings are private and were not inspected during verification. Do not paste a seed phrase into chat or commit signing credentials.

## Application and indexing configuration

The local `.env.local` and tracked `.env.example` now contain:

```dotenv
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID=ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch
NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID=ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc
NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID=SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token
NEXT_PUBLIC_STACKPAY_SBTC_ASSET_NAME=sbtc-token
NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
NEXT_PUBLIC_STACKPAY_USDCX_ASSET_NAME=usdcx-token
```

After contracts confirm, copy these public settings into the hosting environment and rebuild (Next.js embeds public configuration at build time). If `STACKPAY_STACKS_API_URL` is set, ensure it points to canonical testnet, not the former PoX-5 preview or mainnet. Update the hosted Chainhook predicate using [the template](stackpay-chainhook-invoice-paid.json), and verify its callback URL and secret authentication separately. Changing this file does not update Hiro's hosted hook.

## Old database records

A testnet reset does not reset Supabase. Do not relabel old invoices/receipts as payments on the new chain, or delete merchant history implicitly. Deployment scoping is still unfinished. Use a separate fresh testnet Supabase project for this deployment's smoke tests, apply all repository migrations there, and point the test instance at it. Keep the existing project available for historical inspection. Migration application and hosted database replacement have not been performed here.

## Post-deployment acceptance

- Collect both deployment transaction IDs, confirm canonical success and byte-for-byte source hashes, and record the reviewed pair in the registry only after verification.
- Verify `.proc` links to `.arch` and accepts the two token principals above.
- Create/pay an STX invoice, then withdraw its processor balance.
- Repeat with small faucet-funded sBTC and USDCx amounts; verify exact assets in wallet post-conditions.
- Exercise MultiPay and Universal QR, receipt generation and the hosted Chainhook callback.
- Confirm duplicate payment attempts fail and no old-chain records appear in the fresh test environment.

The automated token tests use explicit SIP-010 fixtures at the configured principals. They test StackPay's payment/withdrawal wiring, not the live bridge or token administration. Simnet success is not a substitute for these live smoke tests or the outstanding v2 production gates.
