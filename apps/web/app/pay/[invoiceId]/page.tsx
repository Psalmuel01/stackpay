"use client";
import { toAtomicAmount } from "@/lib/amounts";

import { useEffect, useMemo, useState, use } from "react";
import { CircleAlert, CircleCheck, Clock3, Download, FileQuestion } from "lucide-react";
import ConnectWalletButton from "@/components/app/ConnectWalletButton";
import StatusBadge from "@/components/app/StatusBadge";
import { formatCurrencyAmount, formatDateTime } from "@/lib/format";
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

type RemoteInvoice = {
  public_id?: string;
  /** Null while an API invoice is still a draft (created on-chain at checkout). */
  onchain_invoice_id: string | null;
  status: "draft" | "pending" | "paid" | "expired" | "canceled";
  amount: number;
  currency: "sBTC" | "STX" | "USDCx";
  description: string;
  recipient_address?: string | null;
  expires_at: string | null;
  paid_at: string | null;
  merchant?: {
    company_name?: string;
    display_name?: string;
    slug?: string;
    email?: string;
    settlement_wallet?: string;
  } | null;
  receipt?: {
    onchain_receipt_id: string;
    tx_id: string;
    payer_wallet_address: string;
    paid_at: string | null;
  } | null;
};

function getEffectiveStatus(invoice: RemoteInvoice | null, nowMs: number) {
  if (!invoice) {
    return "pending";
  }

  if (invoice.status !== "pending" && invoice.status !== "draft") {
    return invoice.status;
  }

  const expiresAtMs = invoice.expires_at ? Date.parse(invoice.expires_at) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return "expired";
  }

  return invoice.status;
}

function getProcessorContractId() {
  const architectureContractId =
    process.env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID ??
    "ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch";
  const [address] = architectureContractId.split(".");
  return process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? `${address}.proc`;
}


function getTokenContractId(currency: string) {
  if (currency === "sBTC") {
    return process.env.NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID ?? "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";
  }

  if (currency === "USDCx") {
    return process.env.NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID ?? "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx";
  }

  return null;
}

/** "In 2 days · Oct 4, 7:45 AM" (shown under an "Expires" label). */
function formatExpiry(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) {
    return "No expiry";
  }
  const absolute = formatDateTime(expiresAt);
  const diffMs = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(diffMs)) {
    return absolute;
  }
  if (diffMs <= 0) {
    return `Expired · ${absolute}`;
  }
  const minutes = Math.ceil(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  const relative =
    minutes < 60
      ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
      : hours < 24
        ? `${hours} ${hours === 1 ? "hour" : "hours"}`
        : `${days} ${days === 1 ? "day" : "days"}`;
  return `In ${relative} · ${absolute}`;
}

type PaymentPhase = "idle" | "preparing-signing" | "preparing" | "signing" | "confirming";

export default function HostedPaymentPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  // Next 15 passes route params as a Promise.
  const { invoiceId } = use(params);
  const [invoice, setInvoice] = useState<RemoteInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentReceiptId, setPaymentReceiptId] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Presentation-only: which step of the payment the customer is in.
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const [justPaid, setJustPaid] = useState(false);
  // True once this visit created the on-chain invoice for a draft (the two-step flow).
  const [twoStep, setTwoStep] = useState(false);

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
    // Pick up connects/disconnects made through ConnectWalletButton on this page.
    const sync = () => setConnectedAddress(getConnectedWalletAddress());
    window.addEventListener("stackpay:auth", sync);
    return () => window.removeEventListener("stackpay:auth", sync);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" });

        if (response.ok) {
          const payload = await response.json();
          if (!cancelled) {
            setInvoice((payload.data ?? null) as RemoteInvoice | null);
            setLoading(false);
          }
          return;
        }

        if (response.status !== 404 || attempt === 9) {
          if (!cancelled) {
            setInvoice(null);
            setLoading(false);
          }
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const effectiveStatus = useMemo(() => getEffectiveStatus(invoice, nowMs), [invoice, nowMs]);
  const merchantName =
    invoice?.merchant?.company_name ||
    invoice?.merchant?.display_name ||
    "Merchant";
  const resolvedReceiptId = paymentReceiptId || invoice?.receipt?.onchain_receipt_id || null;

  /**
   * API invoices start as drafts: the customer first creates the on-chain invoice from the
   * merchant's Universal link (step 1), then pays it (step 2). Returns the on-chain invoice id.
   */
  async function createDraftOnchain(publicId: string): Promise<string> {
    const prepared = await fetch(`/api/invoices/${publicId}/checkout`, { method: "POST" });
    const preparedPayload = await prepared.json();
    if (!prepared.ok) throw new Error(preparedPayload?.error?.message ?? "This invoice can’t be paid right now.");
    const { contractIntent, expiresInSeconds } = preparedPayload.data as { contractIntent: StackPayContractIntent; expiresInSeconds: number };

    setPhase("preparing-signing");
    const txId = await new Promise<string>((resolve, reject) => {
      submitContractIntent(contractIntent, {
        onCancel: () => reject(new Error("The request was canceled in your wallet. You can try again.")),
        onFinish: ({ txId: finishedTxId }) => resolve(finishedTxId),
      }).catch(reject);
    });

    setPhase("preparing");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(`/api/invoices/${publicId}/checkout/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, expiresInSeconds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not prepare the payment.");
      if (payload.data?.status === "success" && payload.data.onchainInvoiceId) return String(payload.data.onchainInvoiceId);
      if (payload.data?.status && payload.data.status !== "pending") throw new Error("The payment request could not be created on Stacks.");
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }
    throw new Error("Preparing the payment took too long. Refresh the page to continue.");
  }

  async function handleRemotePayment() {
    if (!invoice) return;

    if (!connectedAddress) {
      setPaymentError("Connect a wallet before making payment.");
      return;
    }

    if (effectiveStatus !== "pending" && effectiveStatus !== "draft") {
      setPaymentError("This invoice is no longer payable.");
      return;
    }

    let onchainInvoiceId = invoice.onchain_invoice_id;
    if (!onchainInvoiceId) {
      if (!invoice.public_id) {
        setPaymentError("This invoice is missing its identifier.");
        return;
      }
      setSubmittingPayment(true);
      setPaymentError(null);
      setTwoStep(true);
      try {
        onchainInvoiceId = await createDraftOnchain(invoice.public_id);
        setInvoice((current) => (current ? { ...current, onchain_invoice_id: onchainInvoiceId, status: "pending" } : current));
      } catch (error) {
        setPaymentError(error instanceof Error ? error.message : "Could not prepare the payment.");
        setSubmittingPayment(false);
        setPhase("idle");
        return;
      }
    }
    await payOnchainInvoice(onchainInvoiceId);
  }

  async function payOnchainInvoice(onchainInvoiceId: string) {
    if (!invoice || !connectedAddress) return;

    const contractIntent: StackPayContractIntent =
      invoice.currency === "STX"
        ? {
          contractId: getProcessorContractId(),
          contractName: "processor",
          functionName: "process-stx-payment",
          network: process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet",
          arguments: [
            { type: "string-ascii", value: onchainInvoiceId },
            { type: "uint", value: toAtomicAmount(String(invoice.amount), invoice.currency) },
          ],
          notes: [],
        }
        : {
          contractId: getProcessorContractId(),
          contractName: "processor",
          functionName: "process-sip-010-payment",
          network: process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet",
          arguments: [
            { type: "string-ascii", value: onchainInvoiceId },
            { type: "uint", value: toAtomicAmount(String(invoice.amount), invoice.currency) },
            { type: "principal", value: getTokenContractId(invoice.currency) ?? "" },
          ],
          notes: [],
        };

    setSubmittingPayment(true);
    setPaymentError(null);
    setPhase("signing");

    try {
      await submitContractIntent(contractIntent, {
        onCancel: () => {
          setPaymentError("Payment was canceled in your wallet. You can try again.");
          setSubmittingPayment(false);
          setPhase("idle");
        },
        onFinish: async ({ txId }) => {
          setPhase("confirming");
          try {
            for (let attempt = 0; attempt < 20; attempt += 1) {
              const response = await fetch(`/api/invoices/${onchainInvoiceId}/payment`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  txId,
                  payerWalletAddress: connectedAddress,
                }),
              });

              const payload = await response.json();
              if (!response.ok) {
                throw new Error(payload?.error?.message ?? "Failed to sync payment.");
              }

              if (payload.data?.sync?.status === "success") {
                setInvoice((current) =>
                  current
                    ? {
                      ...current,
                      status: "paid",
                      paid_at: new Date().toISOString(),
                    }
                    : current
                );
                setPaymentReceiptId(payload.data?.sync?.receiptId ?? null);
                setJustPaid(true);
                return;
              }

              if (
                payload.data?.sync?.status === "failed" ||
                payload.data?.sync?.status === "abort_by_response" ||
                payload.data?.sync?.status === "abort_by_post_condition"
              ) {
                throw new Error(payload.data?.sync?.result ?? "Payment failed.");
              }

              await new Promise((resolve) => window.setTimeout(resolve, 3000));
            }

            throw new Error("Payment confirmation timed out.");
          } catch (syncError) {
            setPaymentError(syncError instanceof Error ? syncError.message : "Failed to confirm payment.");
          } finally {
            setSubmittingPayment(false);
            setPhase("idle");
          }
        },
      });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Failed to submit payment.");
      setSubmittingPayment(false);
      setPhase("idle");
    }
  }


  if (loading) {
    return <CheckoutSkeleton label="Loading invoice…" />;
  }

  if (!invoice) {
    return (
      <CheckoutNotFound icon={<FileQuestion size={22} />} title="We couldn’t find this invoice">
        <p>
          Check that you opened the full link you were sent. If it still doesn’t load, contact the business that sent
          it and ask for a new payment link.
        </p>
      </CheckoutNotFound>
    );
  }

  const amountLabel = formatCurrencyAmount(Number(invoice.amount), invoice.currency);
  const statusLabel = effectiveStatus === "paid" ? "Paid" : effectiveStatus === "expired" ? "Expired" : effectiveStatus === "canceled" ? "Canceled" : "Pending";
  const isDraft = !invoice.onchain_invoice_id;

  return (
    <CheckoutShell merchantName={merchantName}>
      <section className="card overflow-hidden" aria-labelledby="checkout-amount">
        <div className="p-5 pb-6 sm:p-6 sm:pb-7">
          <div className="flex items-center justify-between gap-3">
            <h2 id="checkout-amount" className="text-sm font-medium text-muted">
              {effectiveStatus === "paid" ? "Amount paid" : "Amount due"}
            </h2>
            <StatusBadge label={statusLabel} />
          </div>
          <AmountDisplay amount={Number(invoice.amount)} currency={invoice.currency} className="mt-2" />
          {invoice.description ? (
            <p className="mt-3 text-base leading-7 text-fg-2">{invoice.description}</p>
          ) : null}
        </div>

        <TicketDivider />
        <div className="px-5 py-1.5 sm:px-6">
          <DetailList>
            <DetailRow term="Pays to">
              <span className="block font-medium text-fg">{merchantName}</span>
              {invoice.recipient_address ? (
                <span className="mt-0.5 block">
                  <CopyValue value={invoice.recipient_address} label="Recipient address" />
                </span>
              ) : null}
            </DetailRow>
            <DetailRow term="Invoice">
              <CopyValue value={invoice.onchain_invoice_id ?? invoice.public_id ?? ""} label="Invoice ID" />
            </DetailRow>
            {effectiveStatus === "paid" ? (
              <DetailRow term="Paid">
                <span className="tabular-nums">
                  {formatDateTime(invoice.paid_at ?? invoice.receipt?.paid_at ?? null)}
                </span>
              </DetailRow>
            ) : (
              <DetailRow term="Expires">
                <span className={effectiveStatus === "expired" ? "text-muted" : undefined}>
                  {formatExpiry(invoice.expires_at, nowMs)}
                </span>
              </DetailRow>
            )}
            {resolvedReceiptId ? (
              <DetailRow term="Receipt">
                <CopyValue value={resolvedReceiptId} label="Receipt ID" />
              </DetailRow>
            ) : null}
          </DetailList>
        </div>

        <div className="space-y-4 border-t border-line bg-subtle/60 p-5 sm:p-6">
          {effectiveStatus === "paid" ? (
            <div role="status" className="flex flex-col items-center py-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success" aria-hidden="true">
                <CircleCheck size={28} />
              </span>
              <p className="mt-4 text-xl font-semibold text-fg">
                {justPaid ? "Payment complete" : "This invoice has been paid"}
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-muted">
                {justPaid
                  ? `${amountLabel} was sent to ${merchantName} and confirmed on Stacks.`
                  : `${merchantName} has received this payment. There’s nothing left to pay.`}
              </p>
              {resolvedReceiptId ? (
                <a
                  href={`/api/receipts/${resolvedReceiptId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-lg mt-5 w-full"
                >
                  <Download size={18} aria-hidden="true" />
                  Download receipt (PDF)
                </a>
              ) : null}
            </div>
          ) : effectiveStatus === "canceled" ? (
            <div className="flex flex-col items-center py-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-line-strong bg-panel text-muted" aria-hidden="true">
                <CircleAlert size={26} />
              </span>
              <p className="mt-4 text-xl font-semibold text-fg">This invoice was canceled</p>
              <p className="mt-1.5 max-w-sm text-sm text-muted">
                {merchantName} canceled this payment request, so there’s nothing to pay. Contact them if you think this is a mistake.
              </p>
            </div>
          ) : effectiveStatus === "expired" ? (
            <div className="flex flex-col items-center py-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-line-strong bg-panel text-muted" aria-hidden="true">
                <Clock3 size={26} />
              </span>
              <p className="mt-4 text-xl font-semibold text-fg">This invoice has expired</p>
              <p className="mt-1.5 max-w-sm text-sm text-muted">
                It can no longer be paid. Contact {merchantName} if you still need to pay, and they can send you a new
                invoice.
              </p>
            </div>
          ) : (
            <>
              {connectedAddress ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">Paying from</p>
                    <p className="text-sm text-muted">Your connected Stacks wallet</p>
                  </div>
                  <div className="shrink-0">
                    <ConnectWalletButton />
                  </div>
                </div>
              ) : null}

              {phase === "preparing-signing" ? (
                <PaymentProgress title="Step 1 of 2: approve the payment request">
                  Your wallet creates this invoice on Stacks. No money moves in this step.
                </PaymentProgress>
              ) : phase === "preparing" ? (
                <PaymentProgress title="Step 1 of 2: preparing your payment…">
                  Waiting for Stacks to confirm the request. Keep this page open.
                </PaymentProgress>
              ) : phase === "signing" ? (
                <PaymentProgress title={twoStep ? "Step 2 of 2: confirm the payment in your wallet" : "Confirm the payment in your wallet"}>
                  Check the amount and recipient, then approve it.
                </PaymentProgress>
              ) : phase === "confirming" ? (
                <PaymentProgress title="Confirming on Stacks…">
                  This can take a minute. Keep this page open.
                </PaymentProgress>
              ) : null}

              {paymentError ? (
                <div role="alert" className="alert alert-danger">
                  <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium">Payment didn’t go through</p>
                    <p className="mt-0.5 break-words text-fg-2">{paymentError}</p>
                  </div>
                </div>
              ) : null}

              {connectedAddress ? (
                <button
                  type="button"
                  onClick={() => void handleRemotePayment()}
                  disabled={submittingPayment}
                  className="btn btn-primary btn-lg w-full"
                >
                  {submittingPayment
                    ? phase === "confirming"
                      ? "Confirming payment…"
                      : phase === "preparing"
                        ? "Preparing payment…"
                        : "Waiting for wallet…"
                    : `Pay ${amountLabel}`}
                </button>
              ) : (
                <ConnectWalletButton variant="inline" />
              )}
              <p className="text-center text-sm text-muted">
                {connectedAddress
                  ? isDraft
                    ? "Your wallet will ask you to approve twice: once to create the invoice, then to pay it."
                    : "You’ll review and approve the payment in your wallet."
                  : `Connect a Stacks wallet such as Leather or Xverse to pay ${amountLabel}.`}
              </p>
            </>
          )}
        </div>
      </section>
    </CheckoutShell>
  );
}
