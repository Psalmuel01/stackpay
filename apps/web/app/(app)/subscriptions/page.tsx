"use client";

import { useState } from "react";
import { Plus, Repeat, UserPlus, Users } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import {
  type Currency,
  formatCurrencyAmount,
  formatDateTime,
  useDemo,
} from "@/components/app/DemoProvider";

const intervals = [
  { label: "Weekly", seconds: 60 * 60 * 24 * 7 },
  { label: "Monthly", seconds: 60 * 60 * 24 * 30 },
  { label: "Quarterly", seconds: 60 * 60 * 24 * 90 },
];

const currencies: Currency[] = ["USDCx", "sBTC", "STX"];

export default function SubscriptionsPage() {
  const { state, actions } = useDemo();
  const [planName, setPlanName] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [planCurrency, setPlanCurrency] = useState<Currency>("USDCx");
  const [interval, setInterval] = useState(intervals[1]);
  const [subscriberName, setSubscriberName] = useState("");
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(state.plans[0]?.id ?? "");

  const createPlan = () => {
    const plan = actions.createPlan({
      name: planName || "New plan",
      amount: Number(planAmount || 0),
      currency: planCurrency,
      intervalLabel: interval.label,
      intervalSeconds: interval.seconds,
      metadata: `source=console`,
    });
    setSelectedPlanId(plan.id);
    setPlanName("");
  };

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Set up recurring plans, add subscribers, and generate renewal invoices. Renewals are created manually for now."
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="card overflow-hidden" aria-labelledby="plans-title">
          <div className="card-header !px-5 sm:!px-6">
            <div>
              <h2 id="plans-title" className="card-title">Plans</h2>
              <p className="card-description">A recurring price customers can subscribe to.</p>
            </div>
          </div>

          <form
            className="space-y-5 border-b border-line p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              createPlan();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="plan-name" className="label">Plan name</label>
                <input
                  id="plan-name"
                  className="field"
                  placeholder="e.g. Pro monthly"
                  value={planName}
                  onChange={(event) => setPlanName(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="plan-amount" className="label">Amount</label>
                <div className="relative">
                  <input
                    id="plan-amount"
                    className="field pr-20 tabular-nums"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={planAmount}
                    onChange={(event) => setPlanAmount(event.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                    {planCurrency}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <fieldset>
                <legend className="label">Currency</legend>
                <div className="segmented flex w-full sm:inline-flex sm:w-auto">
                  {currencies.map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      aria-pressed={planCurrency === currency}
                      onClick={() => setPlanCurrency(currency)}
                      className="flex-1 sm:flex-none"
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Billing interval</legend>
                <div className="segmented flex w-full sm:inline-flex sm:w-auto">
                  {intervals.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      aria-pressed={interval.label === item.label}
                      onClick={() => setInterval(item)}
                      className="flex-1 sm:flex-none"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <button type="submit" className="btn btn-primary w-full sm:w-auto">
              <Plus size={18} aria-hidden="true" />
              Create plan
            </button>
          </form>

          {state.plans.length ? (
            <ul className="divide-y divide-line">
              {state.plans.map((plan) => {
                const selected = selectedPlanId === plan.id;
                return (
                  <li key={plan.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{plan.name}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        <span className="tabular-nums text-fg-2">{formatCurrencyAmount(plan.amount, plan.currency)}</span>
                        {" · "}
                        {plan.intervalLabel}
                        <span className="text-faint"> · Created {formatDateTime(plan.createdAt)}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className="chip shrink-0"
                      aria-label={`${selected ? "Selected" : "Select"} ${plan.name} for new subscribers`}
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                <Repeat size={22} />
              </span>
              <h3>No plans yet</h3>
              <p>Create a plan above. It will appear here, ready to assign to subscribers.</p>
            </div>
          )}
        </section>

        <section className="card overflow-hidden" aria-labelledby="subscribers-title">
          <div className="card-header !px-5 sm:!px-6">
            <div>
              <h2 id="subscribers-title" className="card-title">Subscribers</h2>
              <p className="card-description">Customers billed on a plan’s schedule.</p>
            </div>
          </div>

          <form
            className="space-y-5 border-b border-line p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              actions.addSubscriber({
                planId: selectedPlanId,
                customer: subscriberName,
                email: subscriberEmail,
                seats: 1,
              });
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="subscriber-name" className="label">Customer name</label>
                <input
                  id="subscriber-name"
                  className="field"
                  value={subscriberName}
                  onChange={(event) => setSubscriberName(event.target.value)}
                  placeholder="Ada Okafor"
                />
              </div>
              <div>
                <label htmlFor="subscriber-email" className="label">Customer email</label>
                <input
                  id="subscriber-email"
                  type="email"
                  className="field"
                  value={subscriberEmail}
                  onChange={(event) => setSubscriberEmail(event.target.value)}
                  placeholder="ada@example.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="subscriber-plan" className="label">Plan</label>
              <select
                id="subscriber-plan"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="field"
              >
                {state.plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary w-full sm:w-auto">
              <UserPlus size={18} aria-hidden="true" />
              Add subscriber
            </button>
          </form>

          {state.subscriptions.length ? (
            <ul className="divide-y divide-line">
              {state.subscriptions.map((subscription) => {
                const plan = state.plans.find((item) => item.id === subscription.planId);
                return (
                  <li key={subscription.id} className="px-5 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">{subscription.customer || "Unnamed customer"}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {plan?.name ?? "Unknown plan"} · Next renewal{" "}
                          <span className="tabular-nums">{formatDateTime(subscription.nextBillingAt)}</span>
                        </p>
                      </div>
                      <StatusBadge
                        className="shrink-0"
                        label={
                          subscription.status === "active"
                            ? "Active"
                            : subscription.status === "paused"
                              ? "Paused"
                              : "Canceled"
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => actions.recordRenewal(subscription.id)}
                      className="btn btn-secondary btn-sm mt-3 min-h-[40px] w-full sm:min-h-[34px] sm:w-auto"
                    >
                      Generate renewal invoice
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                <Users size={22} />
              </span>
              <h3>No subscribers yet</h3>
              <p>Add a customer to a plan above. Their next renewal date will show here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
