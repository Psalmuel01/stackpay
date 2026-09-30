import { randomUUID } from "node:crypto";
import { APIConnectionError, StackPayError, errorFromResponse } from "./errors.js";
import { constructEvent, generateTestHeader, verifySignature } from "./webhooks.js";
import type {
  Event,
  Invoice,
  InvoiceCreateParams,
  InvoiceListParams,
  List,
  ListParams,
  PaymentLink,
  PaymentLinkCreateParams,
  Receipt,
  RequestOptions,
  Settlement,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointUpdateParams,
} from "./types.js";

export const VERSION = "0.1.0";

export interface StackPayOptions {
  /** Secret key: sk_test_… for testnet deployments, sk_live_… for mainnet. */
  secretKey: string;
  /** Origin of your StackPay deployment, e.g. https://pay.example.com. */
  baseUrl?: string;
  /** Request timeout in milliseconds (default 30 000). */
  timeout?: number;
  /** Automatic retries for network errors, 409 in-progress, 429, and 5xx (default 2). */
  maxNetworkRetries?: number;
  /** Custom fetch (for tests, proxies, or runtimes without a global fetch). */
  fetch?: typeof fetch;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Query = Record<string, string | number | undefined>;

const DEFAULT_BASE_URL = "https://stackpay.vercel.app";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StackPay {
  readonly invoices: Invoices;
  readonly paymentLinks: PaymentLinks;
  readonly receipts: Receipts;
  readonly settlements: Settlements;
  readonly events: Events;
  readonly webhookEndpoints: WebhookEndpoints;
  readonly webhookDeliveries: WebhookDeliveries;
  /** Signature helpers for handling incoming webhooks. */
  readonly webhooks = { verifySignature, constructEvent, generateTestHeader };
  readonly livemode: boolean;

  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxNetworkRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StackPayOptions) {
    if (!options?.secretKey || !/^sk_(test|live)_/.test(options.secretKey)) {
      throw new StackPayError("A StackPay secret key (sk_test_… or sk_live_…) is required.", { type: "invalid_configuration" });
    }
    this.secretKey = options.secretKey;
    this.livemode = options.secretKey.startsWith("sk_live_");
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 30_000;
    this.maxNetworkRetries = Math.max(0, options.maxNetworkRetries ?? 2);
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new StackPayError("No fetch implementation available; pass options.fetch.", { type: "invalid_configuration" });
    this.fetchImpl = fetchImpl;

    this.invoices = new Invoices(this);
    this.paymentLinks = new PaymentLinks(this);
    this.receipts = new Receipts(this);
    this.settlements = new Settlements(this);
    this.events = new Events(this);
    this.webhookEndpoints = new WebhookEndpoints(this);
    this.webhookDeliveries = new WebhookDeliveries(this);
  }

  /**
   * Low-level request. Writes always carry an Idempotency-Key (generated if not supplied), so
   * automatic retries after a timeout can never create a duplicate.
   */
  async request<T>(method: Method, path: string, body?: unknown, query?: Query, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      Accept: "application/json",
      "User-Agent": `stackpay-node/${VERSION}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["Idempotency-Key"] = options.idempotencyKey ?? randomUUID();
    const payload = body === undefined ? undefined : JSON.stringify(body);

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeout ?? this.timeout);
      const abortFromCaller = () => controller.abort();
      options.signal?.addEventListener("abort", abortFromCaller);
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body: payload, signal: controller.signal });
      } catch (error) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortFromCaller);
        if (options.signal?.aborted) throw new APIConnectionError("The request was aborted.", { type: "api_connection_error" });
        if (attempt < this.maxNetworkRetries) {
          await sleep(this.backoff(attempt));
          continue;
        }
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new APIConnectionError(timedOut ? "The request to StackPay timed out." : "Could not connect to StackPay.", { type: "api_connection_error" });
      }
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromCaller);

      const requestId = response.headers.get("request-id") ?? undefined;
      const text = await response.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (response.ok) return data as T;

      const retryable = response.status === 429 || response.status >= 500 || (response.status === 409 && (data as any)?.error?.code === "idempotency_key_in_use");
      if (retryable && attempt < this.maxNetworkRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20_000) : this.backoff(attempt));
        continue;
      }
      throw errorFromResponse(response.status, data, requestId);
    }
  }

  private backoff(attempt: number) {
    const base = Math.min(500 * 2 ** attempt, 8_000);
    return base / 2 + Math.random() * (base / 2);
  }

  /** Iterates every object across pages. */
  async *paginate<T>(path: string, query: Query = {}): AsyncGenerator<T, void, undefined> {
    let cursor = typeof query.starting_after === "string" ? query.starting_after : undefined;
    for (;;) {
      const page = await this.request<List<T>>("GET", path, undefined, { ...query, starting_after: cursor });
      for (const item of page.data) yield item;
      if (!page.has_more || !page.next_cursor) return;
      cursor = page.next_cursor;
    }
  }
}

function id(value: string, name = "id") {
  if (typeof value !== "string" || !value) throw new StackPayError(`${name} is required.`, { type: "invalid_request_error", param: name });
  return encodeURIComponent(value);
}

class Invoices {
  constructor(private readonly client: StackPay) {}
  /** Creates a draft invoice and returns its hosted checkout_url. */
  create(params: InvoiceCreateParams, options?: RequestOptions) {
    return this.client.request<Invoice>("POST", "/invoices", { ...params, amount: String(params.amount) }, undefined, options);
  }
  retrieve(invoiceId: string, options?: RequestOptions) {
    return this.client.request<Invoice>("GET", `/invoices/${id(invoiceId, "invoiceId")}`, undefined, undefined, options);
  }
  list(params: InvoiceListParams = {}, options?: RequestOptions) {
    return this.client.request<List<Invoice>>("GET", "/invoices", undefined, { ...params }, options);
  }
  /** Iterates all invoices matching the filters: `for await (const invoice of stackpay.invoices.listAll())`. */
  listAll(params: Omit<InvoiceListParams, "starting_after"> = {}) {
    return this.client.paginate<Invoice>("/invoices", { ...params });
  }
  /** Cancels a draft. Invoices already created on-chain cannot be canceled. */
  cancel(invoiceId: string, options?: RequestOptions) {
    return this.client.request<Invoice>("POST", `/invoices/${id(invoiceId, "invoiceId")}/cancel`, undefined, undefined, options);
  }
}

class PaymentLinks {
  constructor(private readonly client: StackPay) {}
  /** Creates a MultiPay link as a draft; the merchant activates it in the console. */
  create(params: PaymentLinkCreateParams, options?: RequestOptions) {
    const body = {
      ...params,
      ...(params.amount !== undefined ? { amount: String(params.amount) } : {}),
      ...(params.suggested_amounts ? { suggested_amounts: params.suggested_amounts.map(String) } : {}),
    };
    return this.client.request<PaymentLink>("POST", "/payment-links", body, undefined, options);
  }
  retrieve(paymentLinkId: string, options?: RequestOptions) {
    return this.client.request<PaymentLink>("GET", `/payment-links/${id(paymentLinkId, "paymentLinkId")}`, undefined, undefined, options);
  }
  list(params: ListParams = {}, options?: RequestOptions) {
    return this.client.request<List<PaymentLink>>("GET", "/payment-links", undefined, { ...params }, options);
  }
  listAll(params: Omit<ListParams, "starting_after"> = {}) {
    return this.client.paginate<PaymentLink>("/payment-links", { ...params });
  }
}

class Receipts {
  constructor(private readonly client: StackPay) {}
  retrieve(receiptId: string, options?: RequestOptions) {
    return this.client.request<Receipt>("GET", `/receipts/${id(receiptId, "receiptId")}`, undefined, undefined, options);
  }
  list(params: ListParams = {}, options?: RequestOptions) {
    return this.client.request<List<Receipt>>("GET", "/receipts", undefined, { ...params }, options);
  }
  listAll(params: Omit<ListParams, "starting_after"> = {}) {
    return this.client.paginate<Receipt>("/receipts", { ...params });
  }
}

class Settlements {
  constructor(private readonly client: StackPay) {}
  retrieve(settlementId: string, options?: RequestOptions) {
    return this.client.request<Settlement>("GET", `/settlements/${id(settlementId, "settlementId")}`, undefined, undefined, options);
  }
  list(params: ListParams = {}, options?: RequestOptions) {
    return this.client.request<List<Settlement>>("GET", "/settlements", undefined, { ...params }, options);
  }
  listAll(params: Omit<ListParams, "starting_after"> = {}) {
    return this.client.paginate<Settlement>("/settlements", { ...params });
  }
}

class Events {
  constructor(private readonly client: StackPay) {}
  retrieve(eventId: string, options?: RequestOptions) {
    return this.client.request<Event>("GET", `/events/${id(eventId, "eventId")}`, undefined, undefined, options);
  }
  list(params: ListParams & { type?: string } = {}, options?: RequestOptions) {
    return this.client.request<List<Event>>("GET", "/events", undefined, { ...params }, options);
  }
  listAll(params: { limit?: number; type?: string } = {}) {
    return this.client.paginate<Event>("/events", { ...params });
  }
}

class WebhookEndpoints {
  constructor(private readonly client: StackPay) {}
  /** The response includes `secret` once. Store it; it cannot be retrieved later. */
  create(params: WebhookEndpointCreateParams, options?: RequestOptions) {
    return this.client.request<WebhookEndpoint>("POST", "/webhook-endpoints", params, undefined, options);
  }
  retrieve(endpointId: string, options?: RequestOptions) {
    return this.client.request<WebhookEndpoint>("GET", `/webhook-endpoints/${id(endpointId, "endpointId")}`, undefined, undefined, options);
  }
  update(endpointId: string, params: WebhookEndpointUpdateParams, options?: RequestOptions) {
    return this.client.request<WebhookEndpoint>("PATCH", `/webhook-endpoints/${id(endpointId, "endpointId")}`, params, undefined, options);
  }
  list(params: ListParams = {}, options?: RequestOptions) {
    return this.client.request<List<WebhookEndpoint>>("GET", "/webhook-endpoints", undefined, { ...params }, options);
  }
  delete(endpointId: string, options?: RequestOptions) {
    return this.client.request<{ id: string; object: "webhook_endpoint"; deleted: true }>("DELETE", `/webhook-endpoints/${id(endpointId, "endpointId")}`, undefined, undefined, options);
  }
  /** Issues a new signing secret (returned once); the old one stops working immediately. */
  rotateSecret(endpointId: string, options?: RequestOptions) {
    return this.client.request<WebhookEndpoint>("POST", `/webhook-endpoints/${id(endpointId, "endpointId")}/rotate-secret`, undefined, undefined, options);
  }
  /** Sends a signed `stackpay.ping` event to this endpoint only. */
  sendTestEvent(endpointId: string, options?: RequestOptions) {
    return this.client.request<WebhookDelivery>("POST", `/webhook-endpoints/${id(endpointId, "endpointId")}/test`, undefined, undefined, options);
  }
}

class WebhookDeliveries {
  constructor(private readonly client: StackPay) {}
  retrieve(deliveryId: string, options?: RequestOptions) {
    return this.client.request<WebhookDelivery>("GET", `/webhook-deliveries/${id(deliveryId, "deliveryId")}`, undefined, undefined, options);
  }
  list(params: ListParams & { endpoint?: string; status?: WebhookDelivery["status"] } = {}, options?: RequestOptions) {
    return this.client.request<List<WebhookDelivery>>("GET", "/webhook-deliveries", undefined, { ...params }, options);
  }
  /** Queues a new attempt of an earlier delivery (for example after fixing your endpoint). */
  replay(deliveryId: string, options?: RequestOptions) {
    return this.client.request<WebhookDelivery>("POST", `/webhook-deliveries/${id(deliveryId, "deliveryId")}/replay`, undefined, undefined, options);
  }
}
