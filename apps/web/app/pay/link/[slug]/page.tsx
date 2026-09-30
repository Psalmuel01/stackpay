"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Link2Off, Minus, Plus } from "lucide-react";
import ConnectWalletButton from "@/components/app/ConnectWalletButton";
import { type Currency, formatCurrencyAmount } from "@/components/app/DemoProvider";
import {
  AmountDisplay,
  CheckoutNotFound,
  CheckoutShell,
  CheckoutSkeleton,
  CopyValue,
  DetailList,
  DetailRow,
  PaymentProgress,
  TicketDivider,
} from "@/components/checkout/Checkout";
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
  // Presentation-only: which step of checkout the customer is in.
  const [phase, setPhase] = useState<"idle" | "signing" | "confirming">("idle");

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
    // Pick up connects/disconnects made through ConnectWalletButton on this page.
    const sync = () => setConnectedAddress(getConnectedWalletAddress());
    window.addEventListener("stackpay:auth", sync);
    return () => window.removeEventListener("stackpay:auth", sync);
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
      ? "Enter the amount you want to pay."
      : isSuggestedMultipay
        ? "Choose an amount."
        : "Fixed price.";
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
    setPhase("signing");

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
          setError("The request was canceled in your wallet. You can try again.");
          setSubmitting(false);
          setPhase("idle");
        },
        onFinish: async ({ txId }) => {
          setPhase("confirming");
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
                    ? "Your invoice is ready. Taking you to payment…"
                    : "Your checkout is ready. Taking you to payment…"
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
            setPhase("idle");
          }
        },
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create invoice.");
      setSubmitting(false);
      setPhase("idle");
    }
  }

  if (loadingRemote) {
    return <CheckoutSkeleton label="Loading checkout…" />;
  }

  if (!remoteLink) {
    return (
      <CheckoutNotFound icon={<Link2Off size={22} />} title="This payment link isn’t available">
        <p>
          The link may be incomplete, or the business may have turned it off. Check the link you were sent, or contact
          the business for a new one.
        </p>
      </CheckoutNotFound>
    );
  }

  const numericAmount = Number(amount);
  const hasAmount = Boolean(amount) && Number.isFinite(numericAmount) && numericAmount > 0;
  const amountLabel = hasAmount ? formatCurrencyAmount(numericAmount, selectedCurrency) : null;

  function stepAmount(direction: 1 | -1) {
    if (!remoteLink) {
      return;
    }
    const base = Number(amount || remoteLink.default_amount || defaultAmountConfig(selectedCurrency).defaultAmount || 0);
    const next = Math.max(amountStep > 0 ? amountStep : 0.001, Math.round((base + direction * amountStep) * 1000) / 1000);
    setAmount(String(next));
  }

  return (
    <CheckoutShell merchantName={merchantName}>
      <section className="card overflow-hidden" aria-labelledby="checkout-title">
        <div className="p-5 sm:p-6">
          <h2 id="checkout-title" className="text-xl font-semibold text-fg">{remoteLink.title}</h2>
          {remoteLink.description ? (
            <p className="mt-1.5 text-base leading-7 text-fg-2">{remoteLink.description}</p>
          ) : null}

          {availableCurrencies.length > 1 ? (
            <div className="mt-6">
              <p id="currency-label" className="label">Pay with</p>
              <div className="segmented flex w-full" role="group" aria-labelledby="currency-label">
                {availableCurrencies.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={selectedCurrency === item}
                    className="flex-1"
                    onClick={() => {
                      setSelectedCurrency(item);
                      setAmount(
                        String(
                          suggestedAmounts[0] ?? remoteLink.default_amount ?? defaultAmountConfig(item).defaultAmount
                        )
                      );
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-sm font-medium text-muted" id="amount-label">Amount</p>
            <div aria-live="polite">
              <AmountDisplay amount={hasAmount ? numericAmount : 0} currency={selectedCurrency} className="mt-1" />
            </div>
            <p className="mt-1 text-sm text-muted">{pageSummary}</p>

            {remoteLink.is_universal ? (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepAmount(-1)}
                  className="btn btn-secondary btn-icon h-11 w-11 shrink-0"
                  aria-label={`Decrease by ${amountStep} ${selectedCurrency}`}
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                {remoteLink.allow_custom_amount ? (
                  <div className="relative min-w-0 flex-1">
                    <label htmlFor="custom-amount" className="sr-only">Custom amount in {selectedCurrency}</label>
                    <input
                      id="custom-amount"
                      className="field pr-20 tabular-nums"
                      value={amount}
                      onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value))}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
                      {selectedCurrency}
                    </span>
                  </div>
                ) : (
                  <p className="min-w-0 flex-1 text-center text-sm text-muted">
                    Adjust in steps of {amountStep} {selectedCurrency}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => stepAmount(1)}
                  className="btn btn-secondary btn-icon h-11 w-11 shrink-0"
                  aria-label={`Increase by ${amountStep} ${selectedCurrency}`}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
            ) : isSuggestedMultipay ? (
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-labelledby="amount-label">
                {suggestedAmounts.map((suggestedAmount) => (
                  <button
                    key={suggestedAmount}
                    type="button"
                    aria-pressed={Number(amount) === suggestedAmount}
                    onClick={() => setAmount(String(suggestedAmount))}
                    className="chip min-h-[40px] tabular-nums"
                  >
                    {formatCurrencyAmount(suggestedAmount, selectedCurrency)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {remoteLink.merchant?.settlement_wallet ? (
          <div className="border-t border-line px-5 py-1.5 sm:px-6">
            <DetailList>
              <DetailRow term="Pays to">
                <span className="block font-medium text-fg">{merchantName}</span>
                <span className="mt-0.5 block">
                  <CopyValue value={remoteLink.merchant.settlement_wallet} label="Recipient address" />
                </span>
              </DetailRow>
            </DetailList>
          </div>
        ) : null}

        <TicketDivider />
        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <label htmlFor="receipt-email" className="label">
              Email for receipt <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="receipt-email"
              className="field"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {remoteLink.is_universal ? (
            <div>
              <label htmlFor="payment-note" className="label">
                What’s this for? <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="payment-note"
                className="field"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Order number, table, or a short note"
              />
            </div>
          ) : null}

          {connectedAddress ? (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">Paying from</p>
                <p className="text-sm text-muted">Your connected Stacks wallet</p>
              </div>
              <div className="shrink-0">
                <ConnectWalletButton />
              </div>
            </div>
          ) : null}

          {successMessage ? (
            <div role="status" className="alert alert-success">
              <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>{successMessage}</p>
            </div>
          ) : phase === "signing" ? (
            <PaymentProgress title="Approve the request in your wallet">
              This creates your invoice. You’ll pay it on the next screen.
            </PaymentProgress>
          ) : phase === "confirming" ? (
            <PaymentProgress title="Preparing your checkout…">
              This can take a minute. Keep this page open.
            </PaymentProgress>
          ) : null}

          {error ? (
            <div role="alert" className="alert alert-danger">
              <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">Something went wrong</p>
                <p className="mt-0.5 break-words text-fg-2">{error}</p>
              </div>
            </div>
          ) : null}

          {connectedAddress ? (
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={submitting}
              className="btn btn-primary btn-lg w-full"
            >
              {submitting
                ? phase === "confirming"
                  ? "Preparing checkout…"
                  : "Waiting for wallet…"
                : amountLabel
                  ? `Continue with ${amountLabel}`
                  : "Continue to payment"}
            </button>
          ) : (
            <div className="border-t border-line pt-5">
              <ConnectWalletButton variant="inline" />
            </div>
          )}
          <p className="text-center text-sm text-muted">
            {connectedAddress
              ? "Next, approve an invoice in your wallet, then pay it."
              : "Connect a Stacks wallet such as Leather or Xverse to continue."}
          </p>
        </div>
      </section>
    </CheckoutShell>
  );
}
