"use client";
import { toAtomicAmount } from "@/lib/amounts";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassCard from "@/components/GlassCard";
import ConnectWalletButton from "@/components/app/ConnectWalletButton";
import StatusBadge from "@/components/app/StatusBadge";
import { formatCurrencyAmount, formatDateTime } from "@/components/app/DemoProvider";
import { getConnectedWalletAddress, submitContractIntent, type StackPayContractIntent } from "@/lib/stacks";

type RemoteInvoice = {
  onchain_invoice_id: string;
  status: "pending" | "paid" | "expired";
  amount: number;
  currency: "sBTC" | "STX" | "USDCx";
  description: string;
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

  if (invoice.status !== "pending") {
    return invoice.status;
  }

  const expiresAtMs = invoice.expires_at ? Date.parse(invoice.expires_at) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return "expired";
  }

  return "pending";
}

function getProcessorContractId() {
  const architectureContractId =
    process.env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID ??
    "ST13J1C3K69H3EDG2SVJ21SQ6GXD6A6F862QCK16D.architecture";
  const [address] = architectureContractId.split(".");
  return process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? `${address}.processor`;
}


function getTokenContractId(currency: string) {
  if (currency === "sBTC") {
    return process.env.NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID ?? "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token";
  }

  if (currency === "USDCx") {
    return process.env.NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID ?? "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx";
  }

  return null;
}

export default function HostedPaymentPage({
  params,
}: {
  params: { invoiceId: string };
}) {
  const [invoice, setInvoice] = useState<RemoteInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentReceiptId, setPaymentReceiptId] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
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
        const response = await fetch(`/api/invoices/${params.invoiceId}`, { cache: "no-store" });

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
  }, [params.invoiceId]);

  const effectiveStatus = useMemo(() => getEffectiveStatus(invoice, nowMs), [invoice, nowMs]);
  const merchantName =
    invoice?.merchant?.company_name ||
    invoice?.merchant?.display_name ||
    "Merchant";
  const resolvedReceiptId = paymentReceiptId || invoice?.receipt?.onchain_receipt_id || null;

  async function handleRemotePayment() {
    if (!invoice?.onchain_invoice_id) {
      setPaymentError("This invoice is missing its on-chain invoice id.");
      return;
    }

    if (!connectedAddress) {
      setPaymentError("Connect a wallet before making payment.");
      return;
    }

    if (effectiveStatus !== "pending") {
      setPaymentError("This invoice is no longer payable.");
      return;
    }

    const contractIntent: StackPayContractIntent =
      invoice.currency === "STX"
        ? {
          contractId: getProcessorContractId(),
          contractName: "processor",
          functionName: "process-stx-payment",
          network: process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet",
          arguments: [
            { type: "string-ascii", value: invoice.onchain_invoice_id },
            { type: "uint", value: toAtomicAmount(Number(invoice.amount), invoice.currency) },
          ],
          notes: [],
        }
        : {
          contractId: getProcessorContractId(),
          contractName: "processor",
          functionName: "process-sip-010-payment",
          network: process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet",
          arguments: [
            { type: "string-ascii", value: invoice.onchain_invoice_id },
            { type: "uint", value: toAtomicAmount(Number(invoice.amount), invoice.currency) },
            { type: "principal", value: getTokenContractId(invoice.currency) ?? "" },
          ],
          notes: [],
        };

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      await submitContractIntent(contractIntent, {
        onCancel: () => {
          setPaymentError("Payment was canceled.");
        },
        onFinish: async ({ txId }) => {
          try {
            for (let attempt = 0; attempt < 20; attempt += 1) {
              const response = await fetch(`/api/invoices/${invoice.onchain_invoice_id}/payment`, {
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
          }
        },
      });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Failed to submit payment.");
      setSubmittingPayment(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center px-6 py-12">
        <div className="mx-auto w-full max-w-3xl">
          <GlassCard className="border border-white/20">
            <div className="space-y-5">
              <div className="text-xs uppercase tracking-[0.35em] text-white/40">Loading invoice</div>
              <div className="h-10 w-56 rounded-2xl bg-white/10" />
              <div className="h-16 w-40 rounded-3xl bg-white/10" />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-24 rounded-2xl bg-white/10" />
                <div className="h-24 rounded-2xl bg-white/10" />
                <div className="h-24 rounded-2xl bg-white/10" />
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="flex min-h-screen items-center px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <GlassCard>
            <div className="text-3xl font-semibold text-white">Invoice not found</div>
            <div className="mt-3 text-sm text-white/60">
              This hosted payment page could not find a matching invoice.
            </div>
            <Link
              href="/create-invoice"
              className="mt-5 inline-flex rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-black"
            >
              Create a new invoice
            </Link>
          </GlassCard>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <GlassCard className="border border-white/20">
          <div className="space-y-6">
            <div className="space-y-3 text-center">
              <div className="text-xs uppercase tracking-[0.35em] text-white/40">Hosted payment</div>
              <h1 className="text-4xl font-semibold text-white">{merchantName}</h1>
              <p className="mx-auto max-w-xl text-sm text-white/60">
                Review the invoice and complete payment with your Stacks wallet.
              </p>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
                    Invoice {invoice.onchain_invoice_id}
                  </div>
                  <div className="mt-3 text-4xl font-semibold text-white">
                    {formatCurrencyAmount(Number(invoice.amount), invoice.currency)}
                  </div>
                </div>
                <StatusBadge
                  label={
                    effectiveStatus === "paid"
                      ? "Paid"
                      : effectiveStatus === "expired"
                        ? "Expired"
                        : "Pending"
                  }
                />
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Description</div>
                  <div className="mt-2 text-sm text-white/75">{invoice.description || "No description"}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Customer</div>
                  <div className="mt-2 text-sm text-white/75">
                    Customer details are private
                  </div>
                  <div className="mt-1 text-xs text-white/40">Contact the merchant for account-specific details.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Expires</div>
                  <div className="mt-2 text-sm text-white/75">
                    {invoice.expires_at ? formatDateTime(invoice.expires_at) : "No expiry"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Wallet checkout</div>
              <div className="mt-4 flex flex-col items-center gap-4 text-center">
                <div className="max-w-md text-sm text-white/65">
                  {connectedAddress
                    ? `Connected wallet ${connectedAddress}`
                    : "Connect a Stacks wallet to pay this invoice."}
                </div>
                <ConnectWalletButton />
                <button
                  onClick={() => void handleRemotePayment()}
                  disabled={submittingPayment || effectiveStatus !== "pending"}
                  className="w-full max-w-sm rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {effectiveStatus === "paid"
                    ? "Payment complete"
                    : effectiveStatus === "expired"
                      ? "Invoice expired"
                      : submittingPayment
                        ? "Processing payment..."
                        : "Pay invoice"}
                </button>
                {paymentError ? (
                  <div className="w-full max-w-sm rounded-2xl bg-white/8 px-4 py-4 text-sm text-rose-300">
                    {paymentError}
                  </div>
                ) : null}
                {paymentReceiptId ? (
                  <div className="w-full max-w-sm rounded-2xl bg-white/8 px-4 py-4 text-sm text-white/75">
                    Receipt {paymentReceiptId} confirmed.
                  </div>
                ) : null}
                {resolvedReceiptId ? (
                  <a
                    href={`/api/receipts/${resolvedReceiptId}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full max-w-sm rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    Download receipt PDF
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-white/30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622C17.176 19.29 21 14.591 21 9c0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Secured and verified by StackPay · 2026
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </main>
  );
}
