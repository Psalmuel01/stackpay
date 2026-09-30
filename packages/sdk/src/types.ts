/** Supported assets. Amounts are exact decimal strings; amount_units are base-unit strings. */
export type Currency = "STX" | "sBTC" | "USDCx";
export type Metadata = Record<string, string>;

export interface List<T> {
  object: "list";
  url: string;
  data: T[];
  has_more: boolean;
  /** Pass as `starting_after` to fetch the next page. */
  next_cursor: string | null;
}

export interface ListParams {
  /** 1–100, default 20. */
  limit?: number;
  starting_after?: string;
}

export type InvoiceStatus = "draft" | "pending" | "paid" | "expired" | "canceled";

export interface InvoicePayment {
  receipt_id: string;
  onchain_receipt_id: string;
  tx_id: string;
  payer: string | null;
  paid_at: string;
  block_hash: string | null;
  block_height: number | null;
  status: "confirmed" | "orphaned";
}

export interface Invoice {
  id: string;
  object: "invoice";
  livemode: boolean;
  status: InvoiceStatus;
  amount: string;
  amount_units: string;
  currency: Currency;
  description: string;
  metadata: Metadata;
  customer: { name: string; email: string };
  recipient: string | null;
  /** Hosted checkout page to send the customer to. */
  checkout_url: string;
  onchain_invoice_id: string | null;
  creation_tx_id: string | null;
  expires_at: string | null;
  paid_at: string | null;
  canceled_at: string | null;
  created_at: string;
  payment: InvoicePayment | null;
}

export interface InvoiceCreateParams {
  /** Decimal amount, e.g. "25" or "0.0005". Strings avoid floating-point surprises. */
  amount: string | number;
  currency: Currency;
  description?: string;
  /** Up to 50 keys; keys ≤ 40 chars; values ≤ 500 chars. */
  metadata?: Metadata;
  /** Seconds until the invoice expires: 300 – 2,592,000 (default 86,400). */
  expires_in?: number;
  customer?: { name?: string; email?: string };
}

export interface InvoiceListParams extends ListParams {
  status?: InvoiceStatus;
}

export interface PaymentLink {
  id: string;
  object: "payment_link";
  livemode: boolean;
  status: "draft" | "active" | "inactive";
  kind: "multipay" | "universal" | string;
  title: string;
  description: string;
  currency: Currency | null;
  accepted_currencies: Currency[];
  pricing: "fixed" | "suggested" | "custom";
  amount: string | null;
  suggested_amounts: string[];
  /** Public checkout URL once active. */
  url: string | null;
  /** Console page where a draft link is activated with the merchant's wallet. */
  activation_url: string | null;
  onchain_link_id: string | null;
  metadata: Metadata;
  created_at: string;
}

export interface PaymentLinkCreateParams {
  title: string;
  description?: string;
  currency: Currency;
  pricing?: "fixed" | "suggested";
  amount?: string | number;
  suggested_amounts?: Array<string | number>;
  metadata?: Metadata;
}

export interface Receipt {
  id: string;
  object: "receipt";
  livemode: boolean;
  status: "confirmed" | "orphaned";
  invoice: string | null;
  onchain_invoice_id: string | null;
  onchain_receipt_id: string;
  amount: string;
  amount_units: string;
  currency: Currency;
  tx_id: string;
  payer: string | null;
  block_hash: string | null;
  block_height: number | null;
  paid_at: string;
  orphaned_at: string | null;
  metadata: Metadata;
  created_at: string;
}

export interface Settlement {
  id: string;
  object: "settlement";
  livemode: boolean;
  status: "confirmed" | "pending" | "failed";
  amount: string;
  amount_units: string;
  currency: Currency;
  destination: string;
  tx_id: string;
  executed_at: string;
  created_at: string;
}

export type EventType =
  | "invoice.created"
  | "invoice.pending"
  | "invoice.paid"
  | "invoice.payment_reverted"
  | "invoice.expired"
  | "invoice.canceled"
  | "settlement.confirmed"
  | "stackpay.ping";

export interface Event<T = Record<string, unknown>> {
  id: string;
  object: "event";
  livemode: boolean;
  type: EventType | string;
  created_at: string;
  data: { object: T };
}

export interface WebhookEndpoint {
  id: string;
  object: "webhook_endpoint";
  livemode: boolean;
  url: string;
  description: string;
  enabled_events: Array<EventType | "*">;
  status: "enabled" | "disabled";
  disabled_reason: string | null;
  secret_prefix: string | null;
  created_at: string;
  /** Present only when the endpoint is created or its secret rotated. Store it securely. */
  secret?: string;
}

export interface WebhookEndpointCreateParams {
  url: string;
  description?: string;
  enabled_events?: Array<EventType | "*">;
}

export interface WebhookEndpointUpdateParams {
  description?: string;
  enabled_events?: Array<EventType | "*">;
  status?: "enabled" | "disabled";
}

export interface WebhookDelivery {
  id: string;
  object: "webhook_delivery";
  livemode: boolean;
  status: "pending" | "succeeded" | "failed" | "dead";
  endpoint: string | null;
  event: string | null;
  event_type: string;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  duration_ms: number | null;
  next_attempt_at: string | null;
  replay_of: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface RequestOptions {
  /** Makes a write safe to retry. Generated automatically for POST/PATCH/DELETE if omitted. */
  idempotencyKey?: string;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
  signal?: AbortSignal;
}
