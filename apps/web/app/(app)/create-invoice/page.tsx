"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Loader2,
  Lock,
  QrCode,
  Repeat,
  UserRound,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import QrPreview from "@/components/app/QrPreview";
import { type Currency, formatCurrencyAmount } from "@/components/app/DemoProvider";
import {
  getConnectedWalletAddress,
  submitContractIntent,
  type StackPayContractIntent,
} from "@/lib/stacks";

type CreateFlow = "standard" | "multipay";
type ExpirationOption = number | "custom";
type MultiPayPricingMode = "fixed" | "suggested";

type MerchantProfile = {
  settlement_wallet?: string | null;
  display_name?: string;
  company_name?: string;
  email?: string;
  slug?: string | null;
};

const flows: Array<{ id: CreateFlow; label: string; summary: string }> = [
  {
    id: "standard",
    label: "Standard",
    summary: "One invoice for one payment. It closes as soon as it’s paid.",
  },
  {
    id: "multipay",
    label: "MultiPay",
    summary: "A reusable link that stays open and accepts any number of payments.",
  },
];

const currencies: Currency[] = ["STX", "sBTC", "USDCx"];
const expirations = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "Custom", hours: "custom" as const },
];

function truncateAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.substring(0, 6)}...${address.slice(-4)}`;
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

export default function CreateInvoicePage() {
  const [flow, setFlow] = useState<CreateFlow>("standard");
  const [currency, setCurrency] = useState<Currency>("STX");
  const [amount, setAmount] = useState("");
  const [expiration, setExpiration] = useState<ExpirationOption>(1);
  const [customExpirationValue, setCustomExpirationValue] = useState("");
  const [customExpirationUnit, setCustomExpirationUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [multiPayPricingMode, setMultiPayPricingMode] = useState<MultiPayPricingMode>("fixed");
  const [suggestedAmounts, setSuggestedAmounts] = useState(["", "", ""]);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [result, setResult] = useState<{
    title: string;
    href?: string;
    summary: string;
    contractIntent?: StackPayContractIntent;
    storage?: string;
    txId?: string;
    onchainInvoiceId?: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const resolvedRecipientAddress = merchantProfile?.settlement_wallet || connectedAddress || "";
  const merchantName = (merchantProfile?.company_name || merchantProfile?.display_name || "").trim();
  const merchantReady = Boolean(
    connectedAddress &&
    (merchantProfile?.company_name ?? "").trim().length > 6 &&
    (merchantProfile?.display_name ?? "").trim() &&
    isValidEmail((merchantProfile?.email ?? "").trim())
  );

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setMerchantProfile(null);
      return;
    }

    let cancelled = false;

    fetch(`/api/merchant/profile?walletAddress=${encodeURIComponent(connectedAddress)}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const payload = await response.json();
        return (payload.data ?? null) as MerchantProfile | null;
      })
      .then((profile) => {
        if (!cancelled) {
          setMerchantProfile(profile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMerchantProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  const previewLabel = useMemo(() => {
    if (result?.href) {
      return result.href.replace(/^\//, "stackpay.app/");
    }
    if (result?.txId && !result?.href) {
      return flow === "standard" ? "Waiting for confirmed invoice link" : "Waiting for confirmed payment link";
    }
    return flow === "standard"
      ? "Generated invoice link appears after confirmation"
      : "Generated payment link appears after confirmation";
  }, [flow, result]);

  async function handleCopy() {
    if (!result?.href) {
      return;
    }

    await navigator.clipboard.writeText(`${window.location.origin}${result.href}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function resetCreateForm() {
    setAmount("");
    setCustomer("");
    setEmail("");
    setDescription("");
    setMultiPayPricingMode("fixed");
    setSuggestedAmounts(["", "", ""]);
    setCustomExpirationValue("");
  }

  function updateSuggestedAmount(index: number, value: string) {
    setSuggestedAmounts((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? sanitizeDecimalInput(value) : entry))
    );
  }

  async function confirmInvoiceFromChain(input: {
    txId: string;
    amount: number;
    currency: Currency;
    description: string;
    customerName: string;
    customerEmail: string;
    recipientAddress: string;
    expiresInSeconds: number;
  }) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch("/api/invoices/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          ...input,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to confirm invoice transaction.");
      }

      if (payload.data?.sync?.status === "success" && payload.data?.sync?.onchainInvoiceId) {
        return {
          invoice: payload.data.invoice,
          txId: input.txId,
          onchainInvoiceId: payload.data.sync.onchainInvoiceId as string,
        };
      }

      if (
        payload.data?.sync?.status === "failed" ||
        payload.data?.sync?.status === "abort_by_response" ||
        payload.data?.sync?.status === "abort_by_post_condition"
      ) {
        throw new Error(payload.data?.sync?.result ?? "Invoice transaction failed on-chain.");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }

    return {
      invoice: null,
      txId: input.txId,
      onchainInvoiceId: null,
    };
  }

  async function confirmPaymentLinkFromChain(paymentLinkId: string, txId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`/api/payment-links/${paymentLinkId}/chain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to confirm payment link transaction.");
      }

      if (payload.data?.onchain_link_id) {
        return payload.data;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }

    return null;
  }

  async function submit() {
    setError(null);
    setSuccessMessage(null);

    if (flow === "standard") {
      if (!connectedAddress) {
        setError("Connect a merchant wallet before creating an invoice.");
        return;
      }

      const numericAmount = Number(amount || 0);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        setError("Enter a valid invoice amount.");
        return;
      }

      const customValue = Number(customExpirationValue || 0);
      const expiresInSeconds =
        expiration === "custom"
          ? customExpirationUnit === "minutes"
            ? customValue * 60
            : customExpirationUnit === "hours"
              ? customValue * 60 * 60
              : customValue * 24 * 60 * 60
          : expiration * 60 * 60;

      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        setError("Enter a valid expiration window.");
        return;
      }

      if (email.trim() && !isValidEmail(email.trim())) {
        setError("Enter a valid email address.");
        return;
      }

      if (!resolvedRecipientAddress) {
        setError("Save a settlement wallet in Settings or connect a wallet first.");
        return;
      }

      if (!merchantReady) {
        setError("Complete Settings first with a valid business name, display name, and email address before creating invoices.");
        return;
      }

      setSubmitting(true);

      try {
        const response = await fetch("/api/invoices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: connectedAddress,
            amount: numericAmount,
            currency,
            description,
            customerName: customer,
            customerEmail: email,
            recipientAddress: resolvedRecipientAddress,
            expiresInSeconds,
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Failed to prepare invoice.");
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
              setResult({
                title: "Awaiting confirmation",
                summary: "Transaction broadcast. Waiting for the chain to confirm and return the invoice id.",
                contractIntent,
                storage: "Stacks pending",
                txId,
              });

              const chain = await confirmInvoiceFromChain({
                txId,
                amount: preparedInvoice.amount,
                currency,
                description: preparedInvoice.description,
                customerName: preparedInvoice.customer_name,
                customerEmail: preparedInvoice.customer_email,
                recipientAddress: preparedInvoice.recipient_address,
                expiresInSeconds: preparedInvoice.expires_in_seconds,
              });

              setResult({
                title: chain.onchainInvoiceId ?? "Invoice created",
                href: chain.onchainInvoiceId ? `/pay/${chain.onchainInvoiceId}` : undefined,
                summary: chain.onchainInvoiceId
                  ? "Invoice created on-chain and stored in Supabase. The hosted link now uses the on-chain invoice id."
                  : "Transaction is still pending confirmation. The invoice will be stored once the chain returns the id.",
                contractIntent,
                storage: chain.onchainInvoiceId ? "Supabase + Stacks" : "Stacks pending",
                txId,
                onchainInvoiceId: chain.onchainInvoiceId,
              });
              if (chain.onchainInvoiceId) {
                setSuccessMessage("Invoice generated successfully.");
                resetCreateForm();
              }
            } catch (syncError) {
              setError(syncError instanceof Error ? syncError.message : "Failed to confirm invoice transaction.");
            } finally {
              setSubmitting(false);
            }
          },
        });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to create invoice.");
        setSubmitting(false);
      }

      return;
    }

    if (!connectedAddress) {
      setError("Connect a merchant wallet before creating a MultiPay route.");
      return;
    }

    if (!merchantReady) {
      setError("Complete Settings first with a valid business name, display name, and email address.");
      return;
    }

    setSubmitting(true);

    try {
      const numericAmount = Number(amount || 0);
      const normalizedSuggestedAmounts =
        multiPayPricingMode === "suggested"
          ? suggestedAmounts
            .map((value) => Number(value || 0))
            .filter((value, index, values) => Number.isFinite(value) && value > 0 && values.indexOf(value) === index)
          : [];

      if (multiPayPricingMode === "fixed") {
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          throw new Error("Enter a valid fixed amount for MultiPay.");
        }
      } else if (normalizedSuggestedAmounts.length === 0) {
        throw new Error("Add at least one suggested amount for MultiPay.");
      }

      const response = await fetch("/api/payment-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          kind: "multipay",
          recipientAddress: resolvedRecipientAddress,
          description,
          defaultCurrency: currency,
          acceptedCurrencies: [currency],
          defaultAmount: multiPayPricingMode === "fixed" ? numericAmount : null,
          suggestedAmounts: multiPayPricingMode === "suggested" ? normalizedSuggestedAmounts : [],
          allowCustomAmount: false,
          metadata: {
            pricingMode: multiPayPricingMode,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to prepare payment link.");
      }

      const paymentLink = payload.data.paymentLink;
      const contractIntent = payload.data.contractIntent as StackPayContractIntent;

      await submitContractIntent(contractIntent, {
        onCancel: () => {
          setError("Contract call was canceled.");
          setSubmitting(false);
        },
        onFinish: async ({ txId }) => {
          try {
            setResult({
              title: paymentLink.slug,
              summary: "Transaction broadcast. Waiting for the chain to confirm the payment link.",
              contractIntent,
              storage: "Stacks pending",
              txId,
            });

            const chainLink = await confirmPaymentLinkFromChain(paymentLink.id, txId);
            setResult({
              title: chainLink?.onchain_link_id ?? paymentLink.slug,
              href: `/pay/link/${paymentLink.slug}`,
              summary: "Payment link created and stored. Customers can now open the public route and pay from it anytime.",
              contractIntent,
              storage: "Supabase + Stacks",
              txId,
            });
            setSuccessMessage("Payment link created successfully.");
            resetCreateForm();
          } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : "Failed to confirm payment link.");
          } finally {
            setSubmitting(false);
          }
        },
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create MultiPay route.");
      setSubmitting(false);
    }
  }

  const isStandard = flow === "standard";
  const linkReady = Boolean(result?.href);
  const awaitingChain = Boolean(result?.txId && !result?.href);
  const awaitingWallet = submitting && !awaitingChain;
  const shareUrl = result?.href && origin ? `${origin}${result.href}` : null;
  const itemNoun = isStandard ? "invoice" : "payment link";
  const selectedExpiry =
    expiration === "custom"
      ? customExpirationValue
        ? `${customExpirationValue} ${customExpirationUnit}`
        : "Custom"
      : expirations.find((item) => item.hours === expiration)?.label ?? "";
  const previewAmount =
    !isStandard && multiPayPricingMode === "suggested"
      ? suggestedAmounts.filter(Boolean).length
        ? suggestedAmounts
          .filter(Boolean)
          .map((value) => formatCurrencyAmount(Number(value), currency))
          .join(" · ")
        : `Choice of amounts in ${currency}`
      : formatCurrencyAmount(Number(amount || 0), currency);
  const recipientHint = merchantProfile?.settlement_wallet
    ? "Your settlement wallet from Settings."
    : connectedAddress
      ? "Your connected wallet. Add a settlement wallet in Settings to be paid somewhere else."
      : "Connect a wallet, or add a settlement wallet in Settings.";

  return (
    <div>
      <PageHeader
        title="Create invoice"
        subtitle="Request a one-time payment, or set up a reusable MultiPay link that customers can pay again and again."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden" aria-labelledby="create-form-title">
          <div className="card-header">
            <div>
              <h2 id="create-form-title" className="card-title">
                {isStandard ? "Invoice details" : "Payment link details"}
              </h2>
              <p className="card-description">
                {isStandard
                  ? "You’ll confirm the invoice in your wallet before it goes live."
                  : "You’ll confirm the link in your wallet before it goes live."}
              </p>
            </div>
          </div>

          <form
            className="space-y-6 p-5 sm:p-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div>
              <span className="label" id="flow-label">
                Invoice type
              </span>
              <div
                className="segmented flex w-full sm:inline-flex sm:w-auto"
                role="group"
                aria-labelledby="flow-label"
              >
                {flows.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={flow === item.id}
                    className="flex-1 sm:flex-none sm:px-5"
                    onClick={() => {
                      setFlow(item.id);
                      setError(null);
                      setSuccessMessage(null);
                    }}
                  >
                    {item.id === "standard" ? (
                      <FileText size={16} aria-hidden="true" />
                    ) : (
                      <Repeat size={16} aria-hidden="true" />
                    )}
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="hint text-sm">{flows.find((item) => item.id === flow)?.summary}</p>
            </div>

            <div className="border-t border-line" aria-hidden="true" />

            {!isStandard ? (
              <div>
                <span className="label" id="pricing-label">
                  Pricing
                </span>
                <div
                  className="segmented flex w-full sm:inline-flex sm:w-auto"
                  role="group"
                  aria-labelledby="pricing-label"
                >
                  {([
                    { id: "fixed", label: "Fixed" },
                    { id: "suggested", label: "Suggested" },
                  ] as const).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={multiPayPricingMode === item.id}
                      className="flex-1 sm:flex-none"
                      onClick={() => setMultiPayPricingMode(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="hint text-sm">
                  {multiPayPricingMode === "fixed"
                    ? "Every customer pays the same amount."
                    : "Customers pick one of up to three amounts you set."}
                </p>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              {isStandard || multiPayPricingMode === "fixed" ? (
                <div>
                  <label className="label" htmlFor="invoice-amount">
                    Amount
                  </label>
                  <div className="relative">
                    <input
                      id="invoice-amount"
                      className="field pr-20 tabular-nums"
                      value={amount}
                      onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value))}
                      placeholder="0.00"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">
                      {currency}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className={!isStandard && multiPayPricingMode === "suggested" ? "md:col-span-2" : undefined}>
                <span className="label" id="currency-label">
                  Currency
                </span>
                <div
                  className="segmented flex w-full sm:inline-flex sm:w-auto"
                  role="group"
                  aria-labelledby="currency-label"
                >
                  {currencies.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={currency === item}
                      className="flex-1 sm:flex-none"
                      onClick={() => setCurrency(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!isStandard && multiPayPricingMode === "suggested" ? (
              <fieldset>
                <legend className="label">Suggested amounts</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {suggestedAmounts.map((entry, index) => (
                    <div key={`suggested-${index}`} className="relative">
                      <input
                        className="field pr-20 tabular-nums"
                        value={entry}
                        onChange={(event) => updateSuggestedAmount(index, event.target.value)}
                        placeholder={`Option ${index + 1}`}
                        aria-label={`Suggested amount ${index + 1}`}
                        inputMode="decimal"
                        autoComplete="off"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">
                        {currency}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="hint text-sm">Leave any options you don’t need empty.</p>
              </fieldset>
            ) : null}

            {isStandard ? (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="invoice-customer">
                      Customer <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <input
                      id="invoice-customer"
                      className="field"
                      value={customer}
                      onChange={(event) => setCustomer(event.target.value)}
                      placeholder="Customer or company name"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="invoice-email">
                      Customer email <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <input
                      id="invoice-email"
                      className="field"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="billing@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <span className="label" id="expiry-label">
                    Expires after
                  </span>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby="expiry-label">
                    {expirations.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="chip"
                        aria-pressed={expiration === item.hours}
                        onClick={() => setExpiration(item.hours)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {expiration === "custom" ? (
                    <div className="well mt-3 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="sm:w-32">
                          <label className="label" htmlFor="custom-expiry">
                            Duration
                          </label>
                          <input
                            id="custom-expiry"
                            className="field tabular-nums"
                            value={customExpirationValue}
                            onChange={(event) => setCustomExpirationValue(event.target.value)}
                            placeholder="5"
                            inputMode="numeric"
                            autoComplete="off"
                          />
                        </div>
                        <div
                          className="segmented flex w-full sm:inline-flex sm:w-auto"
                          role="group"
                          aria-label="Duration unit"
                        >
                          {(["minutes", "hours", "days"] as const).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              aria-pressed={customExpirationUnit === unit}
                              className="flex-1 capitalize sm:flex-none"
                              onClick={() => setCustomExpirationUnit(unit)}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="hint text-sm">Counted from the moment the invoice is created.</p>
                    </div>
                  ) : (
                    <p className="hint text-sm">After this, the invoice can no longer be paid.</p>
                  )}
                </div>

                <div>
                  <label className="label" htmlFor="invoice-description">
                    Description <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="invoice-description"
                    className="field"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What the customer is paying for"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="label" htmlFor="link-description">
                  Description <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="link-description"
                  className="field"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What customers are paying for"
                  autoComplete="off"
                />
                <p className="hint text-sm">Shown on the checkout page every time someone pays.</p>
              </div>
            )}

            <div className="border-t border-line" aria-hidden="true" />

            <div className="grid gap-5 md:grid-cols-2">
              <div className="min-w-0">
                <label className="label flex items-center gap-1.5" htmlFor="invoice-recipient">
                  Paid to
                  <Lock size={14} className="text-muted" aria-hidden="true" />
                  <span className="sr-only">(read-only)</span>
                </label>
                <input
                  id="invoice-recipient"
                  className="field cursor-default font-mono"
                  readOnly
                  value={resolvedRecipientAddress ? truncateAddress(resolvedRecipientAddress) : "No wallet yet"}
                  title={resolvedRecipientAddress || undefined}
                />
                <p className="hint text-sm">{recipientHint}</p>
              </div>
              <div className="min-w-0">
                <label className="label flex items-center gap-1.5" htmlFor="invoice-merchant">
                  Business name
                  <Lock size={14} className="text-muted" aria-hidden="true" />
                  <span className="sr-only">(read-only)</span>
                </label>
                <input
                  id="invoice-merchant"
                  className="field cursor-default"
                  readOnly
                  value={merchantName || "Not set up yet"}
                />
                <p className="hint text-sm">
                  Shown to customers at checkout. Change it in{" "}
                  <Link href="/profile" className="link">
                    Profile
                  </Link>
                  .
                </p>
              </div>
            </div>

            {!connectedAddress ? (
              <div className="alert alert-warning" role="status">
                <Wallet size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Connect your wallet to continue</p>
                  <p className="text-fg-2">
                    You’ll approve each {itemNoun} in your Stacks wallet. StackPay saves it once the transaction is
                    confirmed on-chain.
                  </p>
                </div>
              </div>
            ) : !merchantReady ? (
              <div className="alert alert-warning" role="status">
                <UserRound size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Finish your merchant profile first</p>
                  <p className="text-fg-2">
                    Add a business name, display name, and email in{" "}
                    <Link href="/profile" className="link">
                      Profile
                    </Link>{" "}
                    before creating {isStandard ? "invoices" : "payment links"}.
                  </p>
                </div>
              </div>
            ) : null}

            {submitting ? (
              <div className="alert" role="status" aria-live="polite">
                <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-accent-text" aria-hidden="true" />
                <div>
                  <p className="font-medium text-fg">
                    {awaitingWallet ? "Confirm in your wallet" : "Waiting for the network"}
                  </p>
                  <p>
                    {awaitingWallet
                      ? `Review and approve the transaction in your wallet to create this ${itemNoun}.`
                      : `Transaction sent. Your ${itemNoun} link appears as soon as Stacks confirms it — this can take a minute or two.`}
                  </p>
                </div>
              </div>
            ) : null}

            {!submitting && awaitingChain ? (
              <div className="alert alert-warning" role="status">
                <Clock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Still confirming on Stacks</p>
                  <p className="text-fg-2">
                    Your transaction was sent but hasn’t confirmed yet. The invoice will appear in Invoices once it
                    does.
                  </p>
                </div>
              </div>
            ) : null}

            {successMessage ? (
              <div className="alert alert-success" role="status">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{successMessage}</p>
                  <p className="text-fg-2">Copy the link or share the QR code to get paid.</p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="alert alert-danger" role="alert">
                <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">
                    {isStandard ? "Couldn’t create the invoice" : "Couldn’t create the payment link"}
                  </p>
                  <p className="text-fg-2">{error}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                Network fees are paid from your wallet.
              </p>
              <button
                type="submit"
                disabled={submitting || !merchantReady}
                className="btn btn-primary btn-lg w-full sm:w-auto"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
                {submitting
                  ? awaitingWallet
                    ? "Waiting for wallet…"
                    : "Confirming…"
                  : isStandard
                    ? "Create invoice"
                    : "Create payment link"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Preview and sharing">
          <section className="card overflow-hidden" aria-labelledby="preview-title">
            <div className="card-header">
              <div>
                <h2 id="preview-title" className="card-title">
                  Checkout preview
                </h2>
                <p className="card-description">Updates as you type.</p>
              </div>
              <span className="badge badge-neutral shrink-0">{isStandard ? "Single payment" : "Reusable"}</span>
            </div>
            <div className="p-5 sm:p-6">
              <p className="truncate text-sm text-muted">{merchantName ? `From ${merchantName}` : "From your business"}</p>
              <p className="mt-1 truncate text-lg font-semibold text-fg">
                {isStandard ? customer || "New invoice" : description || "Payment link"}
              </p>
              <p className="mt-3 break-words text-2xl font-semibold tabular-nums text-fg">{previewAmount}</p>
              <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
                {isStandard ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Expires after</dt>
                      <dd className="text-fg-2">{selectedExpiry}</dd>
                    </div>
                    {description ? (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-muted">For</dt>
                        <dd className="min-w-0 truncate text-fg-2">{description}</dd>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Pricing</dt>
                    <dd className="text-fg-2">
                      {multiPayPricingMode === "fixed" ? "Fixed amount" : "Customer picks an amount"}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Pay with</dt>
                  <dd className="text-fg-2">{currency}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card overflow-hidden" aria-labelledby="share-title">
            <div className="card-header">
              <div>
                <h2 id="share-title" className="card-title">
                  Share
                </h2>
                <p className="card-description">
                  {linkReady
                    ? `Your ${itemNoun} is live.`
                    : awaitingChain
                      ? "Waiting for confirmation."
                      : `Available once the ${itemNoun} is created.`}
                </p>
              </div>
              {linkReady ? (
                <span className="badge badge-success shrink-0">Ready</span>
              ) : awaitingChain ? (
                <span className="badge badge-warning shrink-0">Confirming</span>
              ) : null}
            </div>

            <div className="p-5 sm:p-6">
              {linkReady && result?.href ? (
                <div className="space-y-4">
                  <QrPreview value={shareUrl} label={previewLabel} size={168} />
                  <div>
                    <label className="label" htmlFor="share-link">
                      {isStandard ? "Invoice link" : "Payment link"}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="share-link"
                        className="field min-w-0 flex-1 font-mono text-sm"
                        readOnly
                        value={shareUrl ?? result.href}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="btn btn-secondary btn-icon h-11 w-11 shrink-0"
                        aria-label={copied ? "Link copied" : "Copy link"}
                        title={copied ? "Copied" : "Copy link"}
                      >
                        {copied ? (
                          <Check size={18} className="text-success" aria-hidden="true" />
                        ) : (
                          <Copy size={18} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <p className="hint text-sm" aria-live="polite">
                      {copied ? "Copied to your clipboard." : "Send this to your customer, or let them scan the code."}
                    </p>
                  </div>
                  <Link
                    href={result.href}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary w-full"
                  >
                    Open checkout
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center py-2 text-center">
                  <span className="empty-state-icon" aria-hidden="true">
                    {awaitingChain ? <Loader2 size={22} className="animate-spin" /> : <QrCode size={22} />}
                  </span>
                  <h3 className="text-base font-semibold text-fg">
                    {awaitingChain ? "Almost there" : `Your link and QR code will appear here`}
                  </h3>
                  <p className="mt-1.5 max-w-[280px] text-sm text-muted">
                    {awaitingChain
                      ? "We’ll show the shareable link as soon as Stacks confirms the transaction."
                      : `After you confirm in your wallet, you’ll get a link to copy, a scannable QR code, and the hosted checkout.`}
                  </p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
