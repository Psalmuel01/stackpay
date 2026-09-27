"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import GlassCard from "@/components/GlassCard";
import DonutBreakdown from "@/components/app/DonutBreakdown";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import TrendChart from "@/components/app/TrendChart";
import { getConnectedWalletAddress } from "@/lib/stacks";

type Currency = "sBTC" | "STX" | "USDCx";

type DashboardResponse = {
  merchant: {
    company_name?: string;
    display_name?: string;
    email?: string;
    slug?: string;
    settlement_wallet?: string | null;
  } | null;
  processorBalances: {
    STX: number;
    sBTC: number;
    USDCx: number;
  };
  stats: {
    totalVolumeUsd: number;
    paidInvoices: number;
    openInvoices: number;
    activePaymentLinks: number;
    multipayLinks: number;
    universalQrActive: boolean;
  };
  trendPoints: Array<{ label: string; value: number }>;
  statusBreakdown: {
    paid: number;
    pending: number;
    expired: number;
  };
  activity: Array<{
    id: string;
    title: string;
    detail: string;
    status: "Paid" | "Pending" | "Expired" | "Active" | "Profile";
    createdAt: string;
    href?: string;
  }>;
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTokenAmount(amount: number, currency: Currency | "STX") {
  const maximumFractionDigits = currency === "sBTC" ? 8 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(amount);
}

export default function DashboardPage() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setDashboard(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/dashboard?walletAddress=${encodeURIComponent(connectedAddress)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Failed to load dashboard.");
        }

        if (!cancelled) {
          setDashboard((payload.data ?? null) as DashboardResponse | null);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load dashboard.");
          setDashboard(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  const merchantName = useMemo(() => {
    return dashboard?.merchant?.company_name || "Merchant";
  }, [dashboard]);

  const displayName = useMemo(() => {
    return dashboard?.merchant?.display_name || "Merchant";
  }, [dashboard]);


  const balanceCards = [
    {
      label: "STX",
      value: formatTokenAmount(dashboard?.processorBalances?.STX ?? 0, "STX"),
      meta: "Balance",
    },
    {
      label: "sBTC",
      value: formatTokenAmount(dashboard?.processorBalances?.sBTC ?? 0, "sBTC"),
      meta: "Balance",
    },
    {
      label: "USDCx",
      value: formatTokenAmount(dashboard?.processorBalances?.USDCx ?? 0, "USDCx"),
      meta: "Balance",
    },
  ];

  const trendPoints =
    dashboard?.trendPoints?.length
      ? dashboard.trendPoints
      : [
          { label: "Mon", value: 0 },
          { label: "Tue", value: 0 },
          { label: "Wed", value: 0 },
          { label: "Thu", value: 0 },
          { label: "Fri", value: 0 },
          { label: "Sat", value: 0 },
          { label: "Sun", value: 0 },
        ];

  return (
    <div>
      <PageHeader
        title={`${displayName}'s Dashboard`}
        subtitle="Track invoice volume, payment-link coverage, and recent payment activity from your live StackPay data."
      />

      {!connectedAddress ? (
        <GlassCard>
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Dashboard</div>
            <div className="mt-3 text-xl font-semibold text-white">Connect a wallet to load merchant data</div>
            <div className="mt-3 text-sm text-white/60">
              StackPay loads your dashboard from the merchant profile tied to the connected wallet.
            </div>
          </div>
        </GlassCard>
      ) : loading ? (
        <GlassCard>
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Loading</div>
            <div className="mt-3 text-xl font-semibold text-white">Loading dashboard</div>
            <div className="mt-3 text-sm text-white/60">
              Fetching your invoices, payment links, and merchant-held balances.
            </div>
          </div>
        </GlassCard>
      ) : error ? (
        <GlassCard>
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Dashboard error</div>
            <div className="mt-3 text-xl font-semibold text-white">Could not load dashboard</div>
            <div className="mt-3 text-sm text-red-300">{error}</div>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            {balanceCards.map((balance) => (
              <GlassCard key={balance.label}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.26em] text-white/35">
                      {balance.label}
                    </div>
                    <div className="mt-3 text-3xl font-semibold text-white">{balance.value}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/45">
                    {balance.meta}
                  </span>
                </div>
                <div className="mt-6 text-xs text-white/55">
                  Current processor balance available for withdrawal.
                </div>
              </GlassCard>
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <GlassCard>
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Total volume</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatUsd(dashboard?.stats.totalVolumeUsd ?? 0)}
              </div>
              <div className="mt-3 text-sm text-white/40">
                Estimated USD · demo rates
              </div>
            </GlassCard>
            <GlassCard>
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Paid invoices</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {dashboard?.stats.paidInvoices ?? 0}
              </div>
              <div className="mt-2 text-sm text-white/55">Confirmed invoice payments</div>
            </GlassCard>
            <GlassCard>
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Open invoices</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {dashboard?.stats.openInvoices ?? 0}
              </div>
              <div className="mt-2 text-sm text-white/55">Invoices awaiting payment</div>
            </GlassCard>
            <GlassCard>
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Payment links</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {dashboard?.stats.activePaymentLinks ?? 0}
              </div>
              <div className="mt-2 text-sm text-white/55">
                {dashboard?.stats.universalQrActive ? "Universal QR active" : "No universal QR yet"}
              </div>
            </GlassCard>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.8fr_1fr]">
            <GlassCard className="border border-white/20">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">
                    Payment volume
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    Last 7 days for {merchantName}
                  </div>
                </div>
                <StatusBadge label="Recorded" />
              </div>
              <TrendChart points={trendPoints} accent />
            </GlassCard>

            <GlassCard>
              <div className="mb-5">
                <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">
                  Invoice status
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Current distribution
                </div>
              </div>
              <DonutBreakdown
                slices={[
                  { label: "Paid", value: dashboard?.statusBreakdown.paid ?? 0, color: "#34d399" },
                  { label: "Pending", value: dashboard?.statusBreakdown.pending ?? 0, color: "#f59e0b" },
                  { label: "Expired", value: dashboard?.statusBreakdown.expired ?? 0, color: "#737373" },
                ]}
              />
            </GlassCard>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_1.1fr]">
            <GlassCard>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">
                  Recent activity
                </div>
                <span className="text-xs text-white/40">Latest merchant events</span>
              </div>
              <div className="space-y-3">
                {dashboard?.activity.length ? (
                  dashboard.activity.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href ?? "/invoices"}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-white">{item.title}</div>
                          <div className="mt-1 text-sm text-white/55">{item.detail}</div>
                          <div className="mt-3 text-xs uppercase tracking-[0.2em] text-white/30">
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(item.createdAt))}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <StatusBadge label={item.status} />
                          <span className="text-xs text-white/40">Open</span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/55">
                    No activity yet. Create your first invoice or payment link to start populating the dashboard.
                  </div>
                )}
              </div>
            </GlassCard>

            <GlassCard>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">
                  Payment routes
                </div>
                <StatusBadge label={dashboard?.stats.universalQrActive ? "Active" : "Pending"} />
              </div>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Universal QR</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {dashboard?.stats.universalQrActive ? "Live" : "Not created"}
                  </div>
                  <div className="mt-2 text-sm text-white/55">
                    {dashboard?.stats.universalQrActive
                      ? "Your universal route is ready to accept flexible payments."
                      : "Set up your permanent QR route for daily payments."}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">MultiPay routes</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {dashboard?.stats.multipayLinks ?? 0}
                  </div>
                  <div className="mt-2 text-sm text-white/55">
                    Active reusable payment links available for public checkout.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Settlement destination</div>
                  <div className="mt-2 text-sm text-white/80 break-all">
                    {dashboard?.merchant?.settlement_wallet || "Uses connected wallet by default"}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <Link
                  href="/create-invoice"
                  className="rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-black"
                >
                  Create invoice
                </Link>
                {/* <Link
                  href="/qr-link"
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/70"
                >
                  Open QR link
                </Link> */}
                <Link
                  href="/payment-links"
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/70"
                >
                  View payment links
                </Link>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
