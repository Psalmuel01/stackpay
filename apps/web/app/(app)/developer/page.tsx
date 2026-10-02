"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import CodeBlock from "@/components/CodeBlock";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, RefreshCw, RotateCcw, Send, Trash2, Webhook } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import { formatDateTime } from "@/lib/format";

const SCOPES = [
  ["invoices:read", "Read invoices"],
  ["invoices:write", "Create and cancel invoices"],
  ["payment_links:read", "Read payment links"],
  ["payment_links:write", "Create payment links"],
  ["receipts:read", "Read receipts"],
  ["refunds:read", "Read refunds"],
  ["settlements:read", "Read settlements"],
  ["events:read", "Read events"],
  ["webhooks:read", "Read webhook endpoints and deliveries"],
  ["webhooks:write", "Manage webhook endpoints"],
] as const;
const READ_SCOPES = SCOPES.map(([scope]) => scope).filter((scope) => scope.endsWith(":read"));
const EVENT_TYPES = ["invoice.created", "invoice.pending", "invoice.paid", "invoice.payment_reverted", "invoice.expired", "invoice.canceled", "invoice.refunded", "settlement.confirmed"];

type ApiKey = { id: string; name: string; environment: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; expires_at: string | null; revoked_at: string | null; status: "active" | "revoked" | "expired" };
type Endpoint = { id: string; url: string; description: string; enabled_events: string[]; status: "enabled" | "disabled"; disabled_reason: string | null; secret_prefix: string | null; created_at: string };
type Delivery = { id: string; status: "pending" | "succeeded" | "failed" | "dead"; endpoint: string | null; event: string | null; event_type: string; attempts: number; response_status: number | null; last_error: string | null; next_attempt_at: string | null; created_at: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "Request failed. Try again.");
  return payload.data as T;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** A secret shown exactly once, with a clear warning. */
function OneTimeSecret({ title, secret, onDone }: { title: string; secret: string; onDone: () => void }) {
  return (
    <div className="alert alert-warning flex-col gap-3" role="status">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <strong className="block text-fg">{title}</strong>
          <p className="mt-0.5 text-sm text-fg-2">Copy it now and store it in your secret manager. For your security, StackPay won’t show it again.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="kbd-copy min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 py-2.5">{secret}</code>
        <CopyButton value={secret} label="secret" />
      </div>
      <button type="button" className="btn btn-ghost btn-sm self-start" onClick={onDone}>I’ve stored it</button>
    </div>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-start gap-3">
          <span className="empty-state-icon mb-0 h-10 w-10" aria-hidden="true">{icon}</span>
          <div>
            <h2 className="card-title">{title}</h2>
            <p className="card-description">{description}</p>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}

function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<"full" | "read" | "custom">("full");
  const [custom, setCustom] = useState<string[]>(["invoices:read", "invoices:write"]);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(() => api<ApiKey[]>("/api/api-keys").then(setKeys).catch((e) => setError(e.message)), []);
  useEffect(() => void load(), [load]);

  const scopes = preset === "full" ? SCOPES.map(([scope]) => scope) : preset === "read" ? READ_SCOPES : custom;

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ secret: string }>("/api/api-keys", { method: "POST", body: JSON.stringify({ name, scopes }) });
      setSecret(created.secret);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function act(key: ApiKey, action: "rotate" | "revoke") {
    const question = action === "revoke"
      ? `Revoke “${key.name || key.prefix}”? Requests using it will fail immediately.`
      : `Rotate “${key.name || key.prefix}”? You’ll get a new key; the current one keeps working for 24 hours.`;
    if (!window.confirm(question)) return;
    setError(null);
    try {
      if (action === "revoke") await api(`/api/api-keys/${key.id}`, { method: "DELETE" });
      else setSecret((await api<{ secret: string }>(`/api/api-keys/${key.id}/rotate`, { method: "POST" })).secret);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed.");
    }
  }

  return (
    <Section icon={<KeyRound size={20} />} title="API keys" description="Secret keys authenticate your server with the StackPay API. Keep them out of browsers and source control.">
      {secret && <OneTimeSecret title="Your new secret key" secret={secret} onDone={() => setSecret(null)} />}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <form onSubmit={create} className="well space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="key-name">Key name</label>
            <input id="key-name" className="field" placeholder="Production backend" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="segmented" role="group" aria-label="Key permissions">
            {([["full", "Full access"], ["read", "Read only"], ["custom", "Custom"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={preset === value} onClick={() => setPreset(value)}>{label}</button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="label">Scopes</legend>
            {SCOPES.map(([scope, label]) => (
              <label key={scope} className="flex items-center gap-2.5 text-sm text-fg-2">
                <input type="checkbox" checked={custom.includes(scope)} onChange={(e) => setCustom((current) => (e.target.checked ? [...current, scope] : current.filter((s) => s !== scope)))} />
                <span>{label} <code className="text-xs text-muted">{scope}</code></span>
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || scopes.length === 0}>
          {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
          Create secret key
        </button>
      </form>

      {keys === null ? (
        <div className="space-y-2" aria-busy="true"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted">No keys yet. Create one to start using the API.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{key.name || "Unnamed key"}</span>
                  <StatusBadge label={key.status === "active" ? (key.expires_at ? "Expiring" : "Active") : key.status === "revoked" ? "Revoked" : "Expired"} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  <code className="text-fg-2">{key.prefix}…</code> · {key.scopes.length} {key.scopes.length === 1 ? "scope" : "scopes"} · created {formatDateTime(key.created_at)}
                  {key.last_used_at ? ` · last used ${formatDateTime(key.last_used_at)}` : " · never used"}
                  {key.status === "active" && key.expires_at ? ` · expires ${formatDateTime(key.expires_at)}` : ""}
                </p>
              </div>
              {key.status === "active" && (
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(key, "rotate")}><RefreshCw size={15} aria-hidden="true" />Rotate</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => act(key, "revoke")}><Trash2 size={15} aria-hidden="true" />Revoke</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const deliveryBadge: Record<Delivery["status"], string> = { pending: "Pending", succeeded: "Delivered", failed: "Failed", dead: "Failed" };

function Webhooks() {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [allEvents, setAllEvents] = useState(true);
  const [events, setEvents] = useState<string[]>(["invoice.paid"]);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [endpointList, deliveryList] = await Promise.all([
        api<{ data: Endpoint[] }>("/api/webhook-endpoints"),
        api<{ data: Delivery[] }>("/api/webhook-deliveries"),
      ]);
      setEndpoints(endpointList.data.filter((endpoint) => endpoint.disabled_reason !== "deleted"));
      setDeliveries(deliveryList.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load webhooks.");
      setEndpoints([]);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ secret: string }>("/api/webhook-endpoints", { method: "POST", body: JSON.stringify({ url, enabled_events: allEvents ? ["*"] : events }) });
      setSecret(created.secret);
      setUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the endpoint.");
    } finally {
      setBusy(false);
    }
  }

  async function act(endpoint: Endpoint, action: "test" | "toggle" | "rotate" | "delete") {
    if (action === "delete" && !window.confirm(`Delete ${endpoint.url}? StackPay stops sending events to it. Delivery history is kept.`)) return;
    if (action === "rotate" && !window.confirm("Rotate the signing secret? The current secret stops working immediately, so update your server right away.")) return;
    setError(null);
    setNotice(null);
    try {
      if (action === "test") {
        await api(`/api/webhook-endpoints/${endpoint.id}/test`, { method: "POST" });
        setNotice("Test event sent. Its result is in recent deliveries below.");
      } else if (action === "toggle") {
        await api(`/api/webhook-endpoints/${endpoint.id}`, { method: "PATCH", body: JSON.stringify({ status: endpoint.status === "enabled" ? "disabled" : "enabled" }) });
      } else if (action === "rotate") {
        setSecret((await api<{ secret: string }>(`/api/webhook-endpoints/${endpoint.id}/rotate-secret`, { method: "POST" })).secret);
      } else {
        await api(`/api/webhook-endpoints/${endpoint.id}`, { method: "DELETE" });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed.");
    }
  }

  async function replay(delivery: Delivery) {
    setError(null);
    try {
      await api(`/api/webhook-deliveries/${delivery.id}/replay`, { method: "POST" });
      setNotice("Delivery queued again.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not replay the delivery.");
    }
  }

  const endpointUrl = (id: string | null) => endpoints?.find((endpoint) => endpoint.id === id)?.url ?? "Removed endpoint";

  return (
    <Section icon={<Webhook size={20} />} title="Webhooks" description="StackPay sends a signed POST to your server when payments happen. Verify the X-StackPay-Signature header on every request.">
      {secret && <OneTimeSecret title="Your endpoint signing secret" secret={secret} onDone={() => setSecret(null)} />}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      {notice && <p role="status" className="alert alert-success">{notice}</p>}

      <form onSubmit={create} className="well space-y-4 p-4">
        <div>
          <label className="label" htmlFor="endpoint-url">Endpoint URL</label>
          <input id="endpoint-url" type="url" required className="field" placeholder="https://example.com/webhooks/stackpay" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="hint">Must be a public https URL. StackPay doesn’t follow redirects.</p>
        </div>
        <fieldset>
          <legend className="label">Events</legend>
          <div className="segmented" role="group" aria-label="Events to send">
            <button type="button" aria-pressed={allEvents} onClick={() => setAllEvents(true)}>All events</button>
            <button type="button" aria-pressed={!allEvents} onClick={() => setAllEvents(false)}>Choose events</button>
          </div>
          {!allEvents && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <button key={type} type="button" className="chip" aria-pressed={events.includes(type)} onClick={() => setEvents((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]))}>
                  <code className="text-xs">{type}</code>
                </button>
              ))}
            </div>
          )}
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={busy || (!allEvents && events.length === 0)}>
          {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Webhook size={17} aria-hidden="true" />}
          Add endpoint
        </button>
      </form>

      {endpoints === null ? (
        <div className="space-y-2" aria-busy="true"><div className="skeleton h-14" /></div>
      ) : endpoints.length === 0 ? (
        <p className="text-sm text-muted">No endpoints yet. Add one to be notified when invoices are paid.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {endpoints.map((endpoint) => (
            <li key={endpoint.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="kbd-copy min-w-0 break-all text-fg">{endpoint.url}</code>
                <StatusBadge label={endpoint.status === "enabled" ? "Active" : "Paused"} />
              </div>
              <p className="text-sm text-muted">
                {endpoint.enabled_events.includes("*") ? "All events" : endpoint.enabled_events.join(", ")}
                {endpoint.secret_prefix ? <> · secret <code className="text-fg-2">{endpoint.secret_prefix}…</code></> : null}
                {endpoint.disabled_reason && endpoint.disabled_reason !== "disabled_by_merchant" ? <> · <span className="text-danger">paused: {endpoint.disabled_reason.replace(/_/g, " ")}</span></> : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-sm" disabled={endpoint.status !== "enabled"} onClick={() => act(endpoint, "test")}><Send size={15} aria-hidden="true" />Send test event</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(endpoint, "toggle")}>{endpoint.status === "enabled" ? "Pause" : "Resume"}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(endpoint, "rotate")}><RefreshCw size={15} aria-hidden="true" />Rotate secret</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => act(endpoint, "delete")}><Trash2 size={15} aria-hidden="true" />Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-fg">Recent deliveries</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Refresh</button>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted">Deliveries appear here with their status, attempts, and your server’s response.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="data-table">
              <thead>
                <tr><th scope="col">Event</th><th scope="col">Endpoint</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">When</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td><code className="text-sm text-fg">{delivery.event_type}</code></td>
                    <td className="max-w-[240px] truncate text-sm text-muted" title={endpointUrl(delivery.endpoint)}>{endpointUrl(delivery.endpoint)}</td>
                    <td>
                      <StatusBadge label={deliveryBadge[delivery.status]} />
                      {delivery.response_status ? <span className="ml-2 text-sm text-muted">HTTP {delivery.response_status}</span> : null}
                      {delivery.status !== "succeeded" && delivery.last_error ? <p className="mt-1 max-w-[260px] truncate text-xs text-muted" title={delivery.last_error}>{delivery.last_error}</p> : null}
                    </td>
                    <td className="tabular-nums text-sm text-fg-2">{delivery.attempts}{delivery.status === "pending" && delivery.next_attempt_at ? <span className="block text-xs text-muted">next {formatDateTime(delivery.next_attempt_at)}</span> : null}</td>
                    <td className="whitespace-nowrap text-sm text-muted">{formatDateTime(delivery.created_at)}</td>
                    <td>
                      {(delivery.status === "failed" || delivery.status === "dead") && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => replay(delivery)}><RotateCcw size={15} aria-hidden="true" />Replay</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}

function QuickStart() {
  const environment = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "live" : "test";
  const origin = typeof window === "undefined" ? "https://your-stackpay-origin" : window.location.origin;
  const node = `import { StackPay } from "stackpay";

const stackpay = new StackPay({
  secretKey: process.env.STACKPAY_SECRET_KEY, // sk_${environment}_…
  baseUrl: "${origin}",
});

const invoice = await stackpay.invoices.create({
  amount: "25",
  currency: "USDCx",
  metadata: { orderId: "382" },
});
// Redirect your customer to invoice.checkout_url`;
  const curl = `curl ${origin}/api/v1/invoices \\
  -H "Authorization: Bearer $STACKPAY_SECRET_KEY" \\
  -H "Idempotency-Key: order-382" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"25","currency":"USDCx","metadata":{"orderId":"382"}}'`;
  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div>
          <h2 className="card-title">Quickstart</h2>
          <p className="card-description">Create an invoice from your server and send the customer to its hosted checkout. Universal QR must be set up once, because customers create the invoice on-chain through it.</p>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
        <CodeBlock className="min-w-0" lang="ts" title="Node.js" code={node} />
        <CodeBlock className="min-w-0" lang="bash" title="cURL" code={curl} />
      </div>
      <div className="border-t border-line px-5 py-4 text-sm text-muted sm:px-6">
        Full reference in the <Link href="/docs/api" className="link">API documentation</Link>. This console is the <strong className="text-fg-2">{environment}</strong> environment.
      </div>
    </section>
  );
}

export default function DeveloperPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Developer" subtitle="API keys, webhooks, and everything you need to integrate StackPay into your product." />
      <QuickStart />
      <ApiKeys />
      <Webhooks />
    </div>
  );
}
