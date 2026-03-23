"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import GlassCard from "@/components/GlassCard";
import ConnectWalletButton from "@/components/app/ConnectWalletButton";
import { type Currency, formatCurrencyAmount } from "@/components/app/DemoProvider";
import { getConnectedWalletAddress, submitContractIntent, type StackPayContractIntent } from "@/lib/stacks";

type RemotePaymentLink = {
  kind: "multipay";
  slug: string;
  title: string;
  description: string;
  accepted_currencies?: Currency[];
  default_currency?: Currency | null;
  default_amount?: number | null;
  amount_step?: number | null;
  allow_custom_amount?: boolean;
  is_universal?: boolean;
  merchant?: {
    company_name?: string;
    display_name?: string;
    settlement_wallet?: string;
  } | null;
  metadata?: {
    pricingMode?: "fixed" | "suggested";
    suggestedAmounts?: number[];
  } | null;
};

function defaultAmountConfig(currency: Currency) {
  if (currency === "sBTC") {
    return { defaultAmount: 0.01, amountStep: 0.005 };
  }
  if (currency === "STX") {
    return { defaultAmount: 50, amountStep: 25 };
  }
  return { defaultAmount: 25, amountStep: 25 };
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function sanitizeDecimalInput(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = sanitized.split(".");

  if (fractionParts.length === 0) {
    return whole;
  }

  return `${whole}.${fractionParts.join("")}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function PublicPaymentLinkPage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  const [remoteLink, setRemoteLink] = useState<RemotePaymentLink | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("sBTC");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingRemote(true);

    fetch(`/api/payment-links/public/${params.slug}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const payload = await response.json();
        return (payload.data ?? null) as RemotePaymentLink | null;
      })
      .then((payload) => {
        if (!cancelled) {
          setRemoteLink(payload);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRemote(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  const availableCurrencies = remoteLink?.accepted_currencies ?? [];
  const suggestedAmounts = useMemo(
    () =>
      ((remoteLink?.metadata?.suggestedAmounts ?? []) as number[])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    [remoteLink?.metadata?.suggestedAmounts]
  );
  const isSuggestedMultipay = Boolean(!remoteLink?.is_universal && suggestedAmounts.length > 0);

  useEffect(() => {
    if (!remoteLink) {
      return;
    }

    const initialCurrency = (availableCurrencies[0] ?? remoteLink.default_currency ?? "sBTC") as Currency;
    const defaults = defaultAmountConfig(initialCurrency);
    setSelectedCurrency(initialCurrency);
    setAmount(String(suggestedAmounts[0] ?? remoteLink.default_amount ?? defaults.defaultAmount));
  }, [availableCurrencies, remoteLink, suggestedAmounts]);

  const amountStep = remoteLink?.amount_step ?? defaultAmountConfig(selectedCurrency).amountStep;
  const merchantName =
    remoteLink?.merchant?.company_name ||
    remoteLink?.merchant?.display_name ||
    "Merchant";

  const pageSummary = useMemo(() => {
    if (!remoteLink) {
      return "";
    }

    return remoteLink.is_universal
      ? "Enter any amount, choose an asset, and pay from the same permanent route."
      : isSuggestedMultipay
        ? "Choose one of the preset amounts and continue straight into payment."
        : "This reusable payment route uses one exact amount and description for every purchase.";
  }, [isSuggestedMultipay, remoteLink]);

  async function handleContinue() {
    if (!remoteLink) {
      return;
    }

    if (!connectedAddress) {
      setError(remoteLink.is_universal ? "Connect a wallet before generating an invoice." : "Connect a wallet before continuing to payment.");
      setSuccessMessage(null);
      return;
    }

    const numericAmount = Number(amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount.");
      setSuccessMessage(null);
      return;
    }

    if (email.trim() && !isValidEmail(email.trim())) {
      setError("Enter a valid email address.");
      setSuccessMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/payment-links/public/${params.slug}/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: numericAmount,
          currency: selectedCurrency,
          customerEmail: email,
          description,
          expiresInSeconds: 24 * 60 * 60,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to prepare payment.");
      }

      const preparedInvoice = payload.data.invoice;
      const contractIntent = payload.data.contractIntent as StackPayContractIntent;

      await submitContractIntent(contractIntent, {
        onCancel: () => {
          setError("Contract call was canceled.");
          setSubmitting(false);
        },
        onFinish: async ({ txId }) => {
          try {
            for (let attempt = 0; attempt < 20; attempt += 1) {
              const confirmResponse = await fetch(
                `/api/payment-links/public/${params.slug}/invoices/confirm`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    txId,
                    amount: preparedInvoice.amount,
                    currency: preparedInvoice.currency,
                    customerEmail: preparedInvoice.customer_email,
                    description: preparedInvoice.description,
                    expiresInSeconds: preparedInvoice.expires_in_seconds,
                  }),
                }
              );

              const confirmPayload = await confirmResponse.json();
              if (!confirmResponse.ok) {
                throw new Error(confirmPayload?.error?.message ?? "Failed to confirm invoice.");
              }

              if (confirmPayload.data?.sync?.status === "success" && confirmPayload.data?.sync?.onchainInvoiceId) {
                setSuccessMessage(
                  remoteLink.is_universal
                    ? "Invoice generated successfully. Redirecting to checkout..."
                    : "Secure checkout is ready. Redirecting now..."
                );
                router.push(`/pay/${confirmPayload.data.sync.onchainInvoiceId}`);
                return;
              }

              if (
                confirmPayload.data?.sync?.status === "failed" ||
                confirmPayload.data?.sync?.status === "abort_by_response" ||
                confirmPayload.data?.sync?.status === "abort_by_post_condition"
              ) {
                throw new Error(confirmPayload.data?.sync?.result ?? "Failed to create invoice.");
              }

              await new Promise((resolve) => window.setTimeout(resolve, 3000));
            }

            throw new Error("Invoice confirmation timed out.");
          } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : "Failed to confirm invoice.");
          } finally {
            setSubmitting(false);
          }
        },
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create invoice.");
      setSubmitting(false);
    }
  }

  if (loadingRemote) {
    return (
      <main className="flex min-h-screen items-center px-6 py-12">
        <div className="mx-auto w-full max-w-3xl">
          <GlassCard className="border border-white/20">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.35em] text-white/40">Loading checkout</div>
              <div className="h-10 w-64 rounded-2xl bg-white/10" />
              <div className="h-4 w-full max-w-xl rounded-full bg-white/10" />
              <div className="h-4 w-3/4 rounded-full bg-white/10" />
            </div>
          </GlassCard>
        </div>
      </main>
    );
  }

  if (!remoteLink) {
    return (
      <main className="flex min-h-screen items-center px-6 py-12">
        <div className="mx-auto w-full max-w-3xl">
          <GlassCard>
            <div className="text-3xl font-semibold text-white">Payment link not found</div>
            <div className="mt-3 text-sm text-white/60">
              This public payment route could not be found.
            </div>
          </GlassCard>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center px-6 py-12">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/40">
              {remoteLink.is_universal ? "Universal payment route" : "MultiPay route"}
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-white">{remoteLink.title}</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/60">{pageSummary}</p>
          </div>

          <GlassCard className="border border-white/20">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                Merchant: {merchantName}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                Assets: {availableCurrencies.join(", ")}
              </div>
              {remoteLink.merchant?.settlement_wallet ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                  Settlement wallet: {truncateAddress(remoteLink.merchant.settlement_wallet)}
                </div>
              ) : null}
              {remoteLink.description ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                  {remoteLink.description}
                </div>
              ) : null}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="border border-white/20">
          <div className="text-[11px] uppercase tracking-[0.26em] text-white/40">Checkout</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {remoteLink.is_universal ? "Generate invoice" : "Pay now"}
          </div>

          <div className="mt-4 text-sm text-white/60">
            {connectedAddress ? `Connected wallet ${connectedAddress}` : "Connect a Stacks wallet to continue."}
          </div>
          <div className="mt-4">
            <ConnectWalletButton />
          </div>

          <div className="mt-6 space-y-3">
            {availableCurrencies.length > 1 ? (
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">Pay with</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {availableCurrencies.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setSelectedCurrency(item);
                        setAmount(
                          String(
                            suggestedAmounts[0] ?? remoteLink.default_amount ?? defaultAmountConfig(item).defaultAmount
                          )
                        );
                      }}
                      className={`rounded-full px-4 py-3 text-sm transition ${
                        selectedCurrency === item
                          ? "border border-white/20 bg-white text-black"
                          : "border border-white/10 bg-white/5 text-white/70"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">Amount</div>
              {remoteLink.is_universal ? (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => {
                        const base = Number(amount || remoteLink.default_amount || defaultAmountConfig(selectedCurrency).defaultAmount || 0);
                        const next = Math.max(amountStep > 0 ? amountStep : 0.001, Math.round((base - amountStep) * 1000) / 1000);
                        setAmount(String(next));
                      }}
                      className="h-12 w-12 rounded-full border border-white/10 bg-black/20 text-xl text-white/75"
                    >
                      -
                    </button>
                    <div className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-lg font-semibold text-white">
                      {amount ? formatCurrencyAmount(Number(amount), selectedCurrency) : `0 ${selectedCurrency}`}
                    </div>
                    <button
                      onClick={() => {
                        const base = Number(amount || remoteLink.default_amount || defaultAmountConfig(selectedCurrency).defaultAmount || 0);
                        const next = Math.max(amountStep > 0 ? amountStep : 0.001, Math.round((base + amountStep) * 1000) / 1000);
                        setAmount(String(next));
                      }}
                      className="h-12 w-12 rounded-full border border-white/10 bg-black/20 text-xl text-white/75"
                    >
                      +
                    </button>
                  </div>
                  {remoteLink.allow_custom_amount ? (
                    <input
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75 outline-none"
                      value={amount}
                      onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value))}
                      placeholder={`Enter amount in ${selectedCurrency}`}
                      inputMode="decimal"
                    />
                  ) : null}
                </>
              ) : isSuggestedMultipay ? (
                <div className="mt-3 grid gap-2">
                  {suggestedAmounts.map((suggestedAmount) => (
                    <button
                      key={suggestedAmount}
                      type="button"
                      onClick={() => setAmount(String(suggestedAmount))}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        Number(amount) === suggestedAmount
                          ? "border-white/20 bg-white text-black"
                          : "border-white/10 bg-black/20 text-white/80"
                      }`}
                    >
                      {formatCurrencyAmount(suggestedAmount, selectedCurrency)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-center text-lg font-semibold text-white">
                  {amount ? formatCurrencyAmount(Number(amount), selectedCurrency) : `0 ${selectedCurrency}`}
                </div>
              )}
            </div>

            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 outline-none"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Receipt email (optional)"
              autoComplete="email"
            />
            {remoteLink.is_universal ? (
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 outline-none"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description (optional)"
              />
            ) : null}

            <button
              onClick={() => void handleContinue()}
              disabled={submitting}
              className="w-full rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Generating..." : remoteLink.is_universal ? "Generate invoice" : "Continue to payment"}
            </button>
            {successMessage ? <div className="text-sm text-emerald-300">{successMessage}</div> : null}
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
          </div>
        </GlassCard>
      </div>
    </main>
  );
}
