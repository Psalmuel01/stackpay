"use client";

import Link from "next/link";
import { ArrowUpRight, Code2, Download, Repeat, Settings2 } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import { settingsNavigation } from "@stackpay/ui";

const summaries: Record<string, string> = {
  "/subscriptions": "Manage recurring payments, trial periods, and subscription lifecycle.",
  "/settlements": "Configure payout rules, thresholds, and settlement execution history.",
  "/developer": "Inspect API keys, webhook deliveries, and integration test events.",
};

const icons: Record<string, typeof Settings2> = {
  "/subscriptions": Repeat,
  "/settlements": Download,
  "/developer": Code2,
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Payout rules, recurring billing, and developer tools. Your everyday payment work stays in the main navigation."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {settingsNavigation.map((item) => {
          const Icon = icons[item.href] ?? Settings2;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="card group flex items-start gap-4 p-5 transition-colors hover:border-line-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:p-6"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-line bg-subtle text-fg-2 group-hover:bg-panel">
                <Icon size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-fg">{item.label}</h2>
                <p className="mt-1 text-sm text-muted">
                  {summaries[item.href] ?? "Open the merchant configuration view."}
                </p>
              </div>
              <ArrowUpRight size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-fg" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
