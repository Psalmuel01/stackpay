# stackpay

Typed Node.js client for the StackPay API: accept sBTC, STX, and USDCx on Stacks through
invoices with hosted checkout, payment links, receipts, settlements, events, and signed webhooks.

```bash
npm install stackpay
```

ES modules only: use `import`, not `require`. TypeScript types are included.

## Requirements

- Node.js 18.17 or later (uses the global `fetch` and `node:crypto`).
- A StackPay secret key from the console (**Developer → API keys**). Keys are environment-bound:
  `sk_test_…` works only against a testnet deployment, `sk_live_…` only against mainnet.

## Quick start

```ts
import { StackPay } from "stackpay";

const stackpay = new StackPay({
  secretKey: process.env.STACKPAY_SECRET_KEY!,
  baseUrl: "https://your-stackpay-deployment.example", // your StackPay origin
});

const invoice = await stackpay.invoices.create({
  amount: "25",            // exact decimal string
  currency: "USDCx",       // "STX" | "sBTC" | "USDCx"
  description: "Order #382",
  metadata: { orderId: "382" },
  success_url: "https://shop.example/orders/382", // optional: where checkout returns the payer
});

// Send the customer to the hosted checkout.
redirect(invoice.checkout_url);
```

API invoices start as `draft`. At checkout the customer's wallet creates the invoice on-chain
(status `pending`) and pays it (status `paid`). No merchant signature is needed per invoice; your
merchant account needs Universal QR set up once in the console.

After payment, checkout returns the payer to `success_url` with `stackpay_invoice=<id>` appended.
Arriving there is **not** proof of payment: fulfil on the `invoice.paid` webhook or confirm with
`stackpay.invoices.retrieve(id)`.

Payment links created through the API keep their `metadata` (for example `{ sku: "TEE-BLK-M" }`)
and copy it, together with `payment_link`, onto every invoice bought through the link.

## Webhooks

Register an endpoint (the signing secret is returned **once**):

```ts
const endpoint = await stackpay.webhookEndpoints.create({
  url: "https://example.com/webhooks/stackpay",
  enabled_events: ["invoice.paid", "invoice.payment_reverted"],
});
saveSecret(endpoint.secret);
```

Verify every delivery using the **raw** request body:

```ts
// Next.js route handler
export async function POST(request: Request) {
  const payload = await request.text();
  const event = stackpay.webhooks.constructEvent(payload, request.headers.get("x-stackpay-signature"), process.env.STACKPAY_WEBHOOK_SECRET!);
  if (event.type === "invoice.paid") await fulfilOrder(event.data.object.metadata.orderId);
  return new Response(null, { status: 200 });
}
```

Deliveries are at-least-once: deduplicate on `event.id`. Failed deliveries retry after 1m, 5m,
30m, and 2h, then stop; replay them with `stackpay.webhookDeliveries.replay(id)`.

Events: `invoice.created`, `invoice.pending`, `invoice.paid`, `invoice.payment_reverted`
(the block containing the payment was reorganized away; do not treat the invoice as paid),
`invoice.expired`, `invoice.canceled`, `invoice.refunded` (a verified on-chain refund to the
original payer; `data.object.refund` has the amount and transaction), `settlement.confirmed`,
and `stackpay.ping` (test).

## Reliability built in

- **Idempotency:** every write sends an `Idempotency-Key` (generated if you don't pass one), and
  retries reuse it, so a timeout can never create a duplicate. Pass your own key to make retries
  safe across process restarts: `stackpay.invoices.create(params, { idempotencyKey: "order-382" })`.
- **Retries:** network errors, `429`, and `5xx` are retried with backoff (`maxNetworkRetries`,
  default 2). Other errors are thrown immediately.
- **Timeouts:** `timeout` (default 30 s), overridable per request.

## Errors

All errors extend `StackPayError` with `type`, `code`, `param`, `statusCode`, and `requestId`:
`AuthenticationError`, `PermissionError`, `InvalidRequestError`, `IdempotencyError`,
`RateLimitError`, `APIError`, `APIConnectionError`, `SignatureVerificationError`.

```ts
try {
  await stackpay.invoices.create({ amount: "0.0000001", currency: "STX" });
} catch (error) {
  if (error instanceof InvalidRequestError) console.log(error.param, error.message, error.requestId);
}
```

## Pagination

```ts
const page = await stackpay.invoices.list({ status: "paid", limit: 50 });
for await (const invoice of stackpay.invoices.listAll({ status: "paid" })) {
  reconcile(invoice);
}
```

## Resources

| Resource | Methods |
| --- | --- |
| `invoices` | `create`, `retrieve`, `list`, `listAll`, `cancel` |
| `paymentLinks` | `create` (draft; activate in the console), `retrieve`, `list`, `listAll` |
| `receipts` | `retrieve`, `list`, `listAll` |
| `refunds` | `retrieve`, `list`, `listAll` (read-only: the merchant signs refunds in the console) |
| `settlements` | `retrieve`, `list`, `listAll` (read-only) |
| `events` | `retrieve`, `list`, `listAll` |
| `webhookEndpoints` | `create`, `retrieve`, `update`, `list`, `delete`, `rotateSecret`, `sendTestEvent` |
| `webhookDeliveries` | `retrieve`, `list`, `replay` |

## Releasing (maintainers)

1. Bump `version` in `package.json` and `VERSION` in `src/client.ts` together, following semver
   (pre-1.0: a minor bump for breaking changes, a patch bump for fixes).
2. From `packages/sdk`: `npm publish`. `prepublishOnly` typechecks, tests and builds first,
   so a broken build cannot be published.
3. Tag the commit `sdk-vX.Y.Z`.

## License

MIT
