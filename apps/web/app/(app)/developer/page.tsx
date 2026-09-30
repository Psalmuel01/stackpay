"use client";

import { useState } from "react";
import { KeyRound, RefreshCw, Send, Webhook } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import { apiResources, webhookEvents } from "@stackpay/integrations";
import { useDemo } from "@/components/app/DemoProvider";

const deliveryLabel: Record<string, string> = {
  delivered: "Delivered",
  pending: "Pending",
  failed: "Failed",
};

const methodTone: Record<string, string> = {
  GET: "border-info/25 bg-info/10 text-info",
  POST: "border-success/25 bg-success/10 text-success",
};

function MethodTag({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex min-w-[52px] justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${methodTone[method] ?? "border-line-strong bg-subtle text-fg-2"
        }`}
    >
      {method}
    </span>
  );
}

export default function DeveloperPage() {
  const { state, actions } = useDemo();
  const [webhookTarget, setWebhookTarget] = useState(state.merchant.webhookUrl);
  const [selectedEvent, setSelectedEvent] = useState("invoice.paid");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Developer tools"
        subtitle="Try API keys, webhook deliveries, and the REST endpoints with sample data. The live API follows the same shape."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">API keys</h2>
              <p className="card-description">Keep these secret. Rotating a key stops the old one working.</p>
            </div>
            <KeyRound size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <p className="label">Secret key</p>
              <div className="well flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="kbd-copy min-w-0">{state.merchant.apiKey}</span>
                <button type="button" onClick={() => actions.rotateApiKey()} className="btn btn-secondary btn-sm shrink-0">
                  <RefreshCw size={14} aria-hidden="true" />
                  Rotate
                </button>
              </div>
            </div>
            <div>
              <p className="label">Webhook signing secret</p>
              <div className="well flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="kbd-copy min-w-0">{state.merchant.webhookSecret}</span>
                <button type="button" onClick={() => actions.rotateWebhookSecret()} className="btn btn-secondary btn-sm shrink-0">
                  <RefreshCw size={14} aria-hidden="true" />
                  Rotate
                </button>
              </div>
              <p className="hint">Use this to verify that webhook requests really came from StackPay.</p>
            </div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">Test a webhook</h2>
              <p className="card-description">Send a sample event to your endpoint and check the delivery log.</p>
            </div>
            <Webhook size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <label htmlFor="webhook-target" className="label">Endpoint URL</label>
              <input
                id="webhook-target"
                type="url"
                inputMode="url"
                className="field"
                placeholder="https://example.com/webhooks/stackpay"
                value={webhookTarget}
                onChange={(event) => setWebhookTarget(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="webhook-event" className="label">Event</label>
              <select
                id="webhook-event"
                value={selectedEvent}
                onChange={(event) => setSelectedEvent(event.target.value)}
                className="field font-mono text-[15px]"
              >
                {webhookEvents.map((event) => (
                  <option key={event} value={event}>
                    {event}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                actions.updateMerchantProfile({ webhookUrl: webhookTarget });
                actions.sendWebhookTest(selectedEvent, webhookTarget);
              }}
              className="btn btn-primary w-full sm:w-auto"
            >
              <Send size={16} aria-hidden="true" />
              Send test event
            </button>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Delivery log</h2>
            <p className="card-description">The most recent webhook attempts, newest first.</p>
          </div>
        </div>
        {state.webhookDeliveries.length ? (
          <ul className="divide-y divide-line">
            {state.webhookDeliveries.map((delivery) => (
              <li key={delivery.id} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="break-all font-mono text-[14px] font-medium text-fg">{delivery.event}</p>
                  <p className="mt-1 text-[14px] text-muted">{delivery.summary}</p>
                </div>
                <StatusBadge label={deliveryLabel[delivery.status] ?? delivery.status} className="shrink-0" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Webhook size={22} aria-hidden="true" />
            </div>
            <h3>No deliveries yet</h3>
            <p>Send a test event above and the attempt will show up here.</p>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">SDK quick start</h2>
              <p className="card-description">Install the client and create your first invoice.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <pre className="well overflow-x-auto p-4 font-mono text-[13.5px] leading-relaxed text-fg-2">
              {`npm install @stackpay/sdk

import { StackPay } from "@stackpay/sdk";

const client = new StackPay({ apiKey: process.env.STACKPAY_API_KEY });
const invoice = await client.invoices.create({ amount: 0.012, currency: "sBTC" });`}
            </pre>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">REST endpoints</h2>
              <p className="card-description">{apiResources.length} endpoints available to your integration.</p>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {apiResources.map((resource) => (
              <li key={`${resource.method}-${resource.path}`} className="px-5 py-3.5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <MethodTag method={resource.method} />
                  <code className="break-all font-mono text-[14px] text-fg">{resource.path}</code>
                </div>
                <p className="mt-1.5 text-[14px] text-muted">{resource.purpose}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
