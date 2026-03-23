"use client";

import { useEffect, useMemo, useState } from "react";
import GlassCard from "@/components/GlassCard";
import PageHeader from "@/components/app/PageHeader";
import StatusBadge from "@/components/app/StatusBadge";
import { type Currency, formatCurrencyAmount, formatDateTime } from "@/components/app/DemoProvider";
import { getConnectedWalletAddress, submitContractIntent, type StackPayContractIntent } from "@/lib/stacks";

type SettlementDashboardResponse = {
  merchant: {
    company_name?: string;
    display_name?: string;
    email?: string;
    slug?: string;
    settlement_wallet?: string | null;
  } | null;
  processorBalances: Record<Currency, number>;
  settlementRuns: Array<{
    id: string;
    tx_id: string;
    currency: Currency;
    amount: number;
    destination: string;
    status: "pending" | "completed" | "failed";
    executed_at: string;
    created_at: string;
  }>;
};

const currencies: Currency[] = ["sBTC", "STX", "USDCx"];

function sanitizeDecimalInput(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = sanitized.split(".");

  if (fractionParts.length === 0) {
    return whole;
  }

  return `${whole}.${fractionParts.join("")}`;
}

function truncateAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function with0x(value: string) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function getTxExplorerUrl(txId: string) {
  const normalized = with0x(txId);
  const network = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";
  const base =
    network === "mainnet"
      ? "https://explorer.hiro.so/txid"
      : "https://explorer.hiro.so/txid";
  const suffix = network === "mainnet" ? "" : "?chain=testnet";
  return `${base}/${normalized}${suffix}`;
}

export default function SettlementsPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<SettlementDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("sBTC");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");

  useEffect(() => {
    setWalletAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setDashboard(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/settlements?walletAddress=${encodeURIComponent(walletAddress)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Failed to load settlements.");
        }

        if (!cancelled) {
          const nextDashboard = (payload.data ?? null) as SettlementDashboardResponse | null;
          setDashboard(nextDashboard);
          setDestination(nextDashboard?.merchant?.settlement_wallet ?? walletAddress);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load settlements.");
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
  }, [walletAddress]);

  const availableBalance = useMemo(() => dashboard?.processorBalances?.[currency] ?? 0, [currency, dashboard]);

  async function reloadSettlements() {
    if (!walletAddress) {
      return;
    }

    const response = await fetch(`/api/settlements?walletAddress=${encodeURIComponent(walletAddress)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "Failed to refresh settlements.");
    }
    setDashboard((payload.data ?? null) as SettlementDashboardResponse | null);
  }

  async function submitSettlement() {
    if (!walletAddress) {
      setError("Connect a wallet before settling funds.");
      return;
    }

    const numericAmount = Number(amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid settlement amount.");
      setSuccessMessage(null);
      return;
    }

    if (!destination.trim()) {
      setError("Enter a destination wallet.");
      setSuccessMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/settlements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          currency,
          amount: numericAmount,
          destination,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to prepare settlement.");
      }

      const preparedSettlement = payload.data.settlement;
      const contractIntent = payload.data.contractIntent as StackPayContractIntent;

      await submitContractIntent(contractIntent, {
        onCancel: () => {
          setError("Settlement transaction was canceled.");
          setSubmitting(false);
        },
        onFinish: async ({ txId }) => {
          try {
            for (let attempt = 0; attempt < 20; attempt += 1) {
              const confirmResponse = await fetch("/api/settlements/confirm", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  walletAddress,
                  txId,
                  currency: preparedSettlement.currency,
                  amount: preparedSettlement.amount,
                  destination: preparedSettlement.destination,
                }),
              });

              const confirmPayload = await confirmResponse.json();
              if (!confirmResponse.ok) {
                throw new Error(confirmPayload?.error?.message ?? "Failed to confirm settlement.");
              }

              if (confirmPayload.data?.sync?.status === "success") {
                setSuccessMessage("Settlement completed successfully.");
                setAmount("");
                await reloadSettlements();
                return;
              }

              if (
                confirmPayload.data?.sync?.status === "failed" ||
                confirmPayload.data?.sync?.status === "abort_by_response" ||
                confirmPayload.data?.sync?.status === "abort_by_post_condition"
              ) {
                throw new Error(confirmPayload.data?.sync?.result ?? "Settlement failed on-chain.");
              }

              await new Promise((resolve) => window.setTimeout(resolve, 3000));
            }

            throw new Error("Settlement confirmation timed out.");
          } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : "Failed to confirm settlement.");
          } finally {
            setSubmitting(false);
          }
        },
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create settlement.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settlements"
        subtitle="Withdraw merchant-held balances from the processor to your settlement wallet and keep a clean settlement history."
      />

      {!walletAddress ? (
        <GlassCard>
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Settlements</div>
            <div className="mt-3 text-xl font-semibold text-white">Connect a wallet to settle funds</div>
            <div className="mt-3 text-sm text-white/60">
              StackPay needs your connected merchant wallet to read processor balances and submit withdrawals.
            </div>
          </div>
        </GlassCard>
      ) : loading ? (
        <GlassCard>
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Loading</div>
            <div className="mt-3 text-xl font-semibold text-white">Loading settlement data</div>
            <div className="mt-3 text-sm text-white/60">
              Fetching your processor balances and settlement history.
            </div>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            {currencies.map((item) => (
              <GlassCard key={item}>
                <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">{item} available</div>
                <div className="mt-3 text-3xl font-semibold text-white">
                  {formatCurrencyAmount(dashboard?.processorBalances?.[item] ?? 0, item)}
                </div>
                <div className="mt-3 text-sm text-white/55">Live processor balance held for your merchant wallet.</div>
              </GlassCard>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
            <GlassCard className="border border-white/20">
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Settle funds</div>
              <div className="mt-2 text-xl font-semibold text-white">Withdraw to your destination wallet</div>

              <div className="mt-5 grid gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/40">Asset</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currencies.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrency(item)}
                        className={`rounded-full px-4 py-2 text-xs ${currency === item
                            ? "border border-white/20 bg-white text-black"
                            : "border border-white/10 bg-white/5 text-white/70"
                          }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/40">Amount</div>
                  <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <input
                      className="w-full bg-transparent text-sm text-white/80 outline-none"
                      value={amount}
                      onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value))}
                      placeholder="Amount to settle"
                      inputMode="decimal"
                    />
                    <span className="text-xs text-white/55">{currency}</span>
                  </div>
                  <div className="mt-2 text-xs text-white/45">
                    Available: {formatCurrencyAmount(availableBalance, currency)}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/40">Destination wallet</div>
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 outline-none"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Settlement wallet"
                  />
                </div>

                <button
                  onClick={() => void submitSettlement()}
                  disabled={submitting}
                  className="rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {submitting ? "Settling..." : "Settle funds"}
                </button>

                {successMessage ? <div className="text-sm text-emerald-300">{successMessage}</div> : null}
                {error ? <div className="text-sm text-red-300">{error}</div> : null}
              </div>
            </GlassCard>

            <GlassCard>
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Settlement destination</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {dashboard?.merchant?.settlement_wallet
                  ? truncateAddress(dashboard.merchant.settlement_wallet)
                  : "Uses connected wallet"}
              </div>
              <div className="mt-3 text-sm text-white/60">
                Update this in Profile if you want settlements to default to a different wallet.
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Merchant</div>
                <div className="mt-2 text-sm text-white/80">
                  {dashboard?.merchant?.company_name || dashboard?.merchant?.display_name || "Merchant"}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                Funds are currently held in the processor contract. This withdrawal moves the selected asset to your chosen settlement destination.
              </div>
            </GlassCard>
          </div>

          <GlassCard className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Settlement history</div>
              <span className="text-xs text-white/40">{dashboard?.settlementRuns.length ?? 0} recent</span>
            </div>

            {dashboard?.settlementRuns.length ? (
              <div className="space-y-3">
                <div className="hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-white/35 md:grid md:grid-cols-[1.05fr_1.15fr_1fr_1fr_140px] md:items-center md:gap-4">
                  <div>Amount</div>
                  <div>Destination</div>
                  <div>Executed</div>
                  <div>Transaction</div>
                  <div className="text-right">Status</div>
                </div>
                {dashboard.settlementRuns.map((run) => (
                  <div
                    key={run.id}
                    className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 md:grid-cols-[1.05fr_1.15fr_1fr_1fr_140px] md:items-center"
                  >
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35 md:hidden">Amount</div>
                      <div className="mt-1 text-sm font-semibold text-white md:mt-0">
                        {formatCurrencyAmount(Number(run.amount), run.currency)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35 md:hidden">Destination</div>
                      <div className="mt-1 text-sm text-white/55 md:mt-0">{truncateAddress(run.destination)}</div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35 md:hidden">Executed</div>
                      <div className="mt-1 text-sm text-white/55 md:mt-0">
                        {formatDateTime(run.executed_at)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35 md:hidden">Transaction</div>
                      <a
                        href={getTxExplorerUrl(run.tx_id)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-sm text-white/70 underline decoration-white/15 underline-offset-4 transition hover:text-white md:mt-0"
                      >
                        {truncateAddress(with0x(run.tx_id))}
                      </a>
                    </div>

                    <div className="flex justify-start md:justify-end">
                      <StatusBadge label={run.status === "completed" ? "Completed" : run.status === "failed" ? "Failed" : "Pending"} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/55">
                No settlement runs yet. Your first completed withdrawal will appear here.
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
