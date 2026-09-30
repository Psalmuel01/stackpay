"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, History, Loader2, Wallet } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
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

const assets: Array<{ currency: Currency; mark: string; description: string }> = [
  { currency: "sBTC", mark: "₿", description: "Bitcoin-backed" },
  { currency: "STX", mark: "S", description: "Stacks" },
  { currency: "USDCx", mark: "$", description: "US dollar-backed" },
];

function formatAmount(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: currency === "sBTC" ? 8 : 6 }).format(amount);
}

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

  const runs = dashboard?.settlementRuns ?? [];
  const merchantName = dashboard?.merchant?.company_name || dashboard?.merchant?.display_name || "Your business";
  const defaultWallet = dashboard?.merchant?.settlement_wallet ?? null;

  const header = (
    <PageHeader
      title="Settlements"
      subtitle="Withdraw what customers have paid you from the StackPay processor to your wallet, and keep track of every withdrawal."
    />
  );

  if (!walletAddress) {
    return (
      <div>
        {header}
        <section className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <Wallet size={22} />
            </span>
            <h3>Connect a wallet to withdraw funds</h3>
            <p>StackPay needs your merchant wallet to read your balances and send withdrawals.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loading) {
    return (
      <div aria-busy="true">
        {header}
        <span className="sr-only">Loading…</span>
        <div className="grid gap-4 sm:grid-cols-3">
          {currencies.map((item) => (
            <div key={item} className="card p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="skeleton h-7 w-7 rounded-full" />
                <div className="skeleton h-4 w-16" />
              </div>
              <div className="skeleton mt-5 h-8 w-32" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="card p-5 sm:p-6">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton mt-6 h-11 w-64 max-w-full" />
            <div className="skeleton mt-5 h-11 w-full" />
            <div className="skeleton mt-5 h-11 w-full" />
          </div>
          <div className="card p-5 sm:p-6">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton mt-4 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <section aria-labelledby="balances-title">
        <h2 id="balances-title" className="sr-only">
          Available balances
        </h2>

        {/* Mobile: one stacked list */}
        <div className="card overflow-hidden sm:hidden">
          <ul className="divide-y divide-line">
            {assets.map(({ currency: item, mark, description }, index) => (
              <li key={item} className="flex items-center gap-3 px-5 py-4">
                <span className={`asset-mark asset-${index}`} aria-hidden="true">
                  {mark}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-fg">{item}</div>
                  <div className="text-sm text-muted">{description}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-lg font-semibold tabular-nums text-fg">
                    {formatAmount(dashboard?.processorBalances?.[item] ?? 0, item)}
                  </div>
                  <div className="text-xs text-muted">available</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Tablet and up: three stat cards */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-3">
          {assets.map(({ currency: item, mark, description }, index) => (
            <div key={item} className="card p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className={`asset-mark asset-${index}`} aria-hidden="true">
                  {mark}
                </span>
                <span className="text-sm font-semibold text-fg">{item}</span>
                <span className="ml-auto text-sm text-muted">{description}</span>
              </div>
              <div className="stat-value mt-5">
                {formatAmount(dashboard?.processorBalances?.[item] ?? 0, item)}
                <span className="ml-1.5 text-base font-medium tracking-normal text-muted">{item}</span>
              </div>
              <div className="mt-1 text-sm text-muted">Available to withdraw</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden" aria-labelledby="withdraw-title">
          <div className="card-header">
            <div>
              <h2 id="withdraw-title" className="card-title">
                Withdraw funds
              </h2>
              <p className="card-description">Send an available balance to a Stacks wallet.</p>
            </div>
          </div>

          <form
            className="space-y-5 p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSettlement();
            }}
          >
            <div>
              <span className="label" id="withdraw-asset-label">
                Asset
              </span>
              <div className="segmented" role="group" aria-labelledby="withdraw-asset-label">
                {currencies.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={currency === item}
                    onClick={() => setCurrency(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label className="label" htmlFor="withdraw-amount">
                  Amount
                </label>
                <span className="text-sm text-muted">
                  <span className="tabular-nums">{formatCurrencyAmount(availableBalance, currency)}</span> available
                </span>
              </div>
              <div className="relative">
                <input
                  id="withdraw-amount"
                  className="field pr-32 tabular-nums"
                  value={amount}
                  onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value))}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby="withdraw-amount-hint"
                />
                <div className="absolute inset-y-0 right-2 flex items-center gap-2">
                  <span className="text-sm text-muted">{currency}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm !min-h-[32px] !px-2.5 text-accent-text"
                    onClick={() => setAmount(String(availableBalance))}
                    disabled={availableBalance <= 0}
                  >
                    Max
                  </button>
                </div>
              </div>
              <p className="hint" id="withdraw-amount-hint">
                You can withdraw up to your available {currency} balance.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="withdraw-destination">
                Destination wallet
              </label>
              <input
                id="withdraw-destination"
                className="field font-mono !text-sm"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="SP… or ST… address"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="hint">Prefilled with your default destination. You can send to a different address.</p>
            </div>

            {submitting ? (
              <div className="alert" role="status">
                <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-muted" aria-hidden="true" />
                <span>Confirm the withdrawal in your wallet. We’ll update your balance once it confirms on-chain.</span>
              </div>
            ) : null}
            {successMessage ? (
              <div className="alert alert-success" role="status">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{successMessage}</span>
              </div>
            ) : null}
            {error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : null}

            <div className="border-t border-line pt-5">
              <button type="submit" disabled={submitting} className="btn btn-primary w-full sm:w-auto">
                <ArrowDownToLine size={17} aria-hidden="true" />
                {submitting ? "Withdrawing…" : "Withdraw funds"}
              </button>
            </div>
          </form>
        </section>

        <aside className="card p-5 sm:p-6" aria-labelledby="destination-title">
          <h2 id="destination-title" className="card-title">
            Where your funds go
          </h2>
          <p className="mt-2 text-sm text-fg-2">
            Customer payments are held in the StackPay processor contract for {merchantName}. A withdrawal moves the
            selected asset from there to the destination wallet.
          </p>

          <dl className="well mt-5 divide-y divide-line text-sm">
            <div className="px-4 py-3">
              <dt className="text-muted">Default destination</dt>
              <dd className={`mt-0.5 text-fg ${defaultWallet ? "font-mono" : ""}`} title={defaultWallet ?? walletAddress}>
                {defaultWallet ? truncateAddress(defaultWallet) : "Your connected wallet"}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-muted">Merchant</dt>
              <dd className="mt-0.5 text-fg">{merchantName}</dd>
            </div>
          </dl>

          <p className="mt-5 text-sm text-muted">
            Want withdrawals to default to a different wallet?{" "}
            <Link href="/profile" className="link">
              Update it in Profile
            </Link>
            .
          </p>
        </aside>
      </div>

      <section className="card mt-4 overflow-hidden" aria-labelledby="history-title">
        <div className="card-header">
          <div>
            <h2 id="history-title" className="card-title">
              Withdrawal history
            </h2>
            <p className="card-description">
              {runs.length ? `${runs.length} recent ${runs.length === 1 ? "withdrawal" : "withdrawals"}` : "Your settlements, newest first."}
            </p>
          </div>
        </div>

        {runs.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Amount</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Date</th>
                    <th scope="col">Transaction</th>
                    <th scope="col" className="text-right">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="font-semibold tabular-nums text-fg">
                        {formatCurrencyAmount(Number(run.amount), run.currency)}
                      </td>
                      <td className="font-mono text-sm text-fg-2" title={run.destination}>
                        {truncateAddress(run.destination)}
                      </td>
                      <td className="text-sm text-fg-2">{formatDateTime(run.executed_at)}</td>
                      <td>
                        <a
                          href={getTxExplorerUrl(run.tx_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="link inline-flex items-center gap-1 font-mono text-sm"
                        >
                          {truncateAddress(with0x(run.tx_id))}
                          <ArrowUpRight size={14} aria-hidden="true" />
                          <span className="sr-only">(opens explorer)</span>
                        </a>
                      </td>
                      <td className="text-right">
                        <RunStatus status={run.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line lg:hidden">
              {runs.map((run) => (
                <li key={run.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold tabular-nums text-fg">
                      {formatCurrencyAmount(Number(run.amount), run.currency)}
                    </div>
                    <RunStatus status={run.status} />
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    To <span className="font-mono">{truncateAddress(run.destination)}</span> ·{" "}
                    {formatDateTime(run.executed_at)}
                  </div>
                  <a
                    href={getTxExplorerUrl(run.tx_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="link mt-1 inline-flex min-h-[32px] items-center gap-1 font-mono text-sm"
                  >
                    {truncateAddress(with0x(run.tx_id))}
                    <ArrowUpRight size={14} aria-hidden="true" />
                    <span className="sr-only">(opens explorer)</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <History size={22} />
            </span>
            <h3>No withdrawals yet</h3>
            <p>Each withdrawal you make appears here with its amount, destination, and on-chain transaction.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function RunStatus({ status }: { status: "pending" | "completed" | "failed" }) {
  if (status === "completed") {
    return <span className="badge badge-success">Completed</span>;
  }
  if (status === "failed") {
    return <span className="badge badge-danger">Failed</span>;
  }
  return <span className="badge badge-warning">Pending</span>;
}
