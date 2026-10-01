"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Undo2, X } from "lucide-react";
import { submitContractIntent, submitStxTransfer, type StackPayContractIntent } from "@/lib/stacks";

type Currency = "sBTC" | "STX" | "USDCx";

type Prepared = {
  amount: string;
  currency: Currency;
  recipient: string;
  transfer:
    | { kind: "stx"; recipient: string; amountMicroStx: string; memo: string; network: string }
    | { kind: "contract-call"; intent: StackPayContractIntent };
};

type Phase =
  | { step: "form" }
  | { step: "wallet" }
  | { step: "confirming"; txId: string; amount: string }
  | { step: "stalled"; txId: string; amount: string }
  | { step: "done"; amount: string };

const POLL_ATTEMPTS = 40;
const POLL_MS = 3000;

/**
 * Refund a paid invoice from the merchant's own wallet back to the original payer. The server
 * prepares the exact transfer and records it only after verifying the anchored transaction.
 */
export default function RefundDialog({
  invoiceId,
  currency,
  refundable,
  onClose,
  onRefunded,
}: {
  invoiceId: string;
  currency: Currency;
  /** Exact decimal string still refundable. */
  refundable: string;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(refundable);
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "form" });
  const [error, setError] = useState<string | null>(null);
  const busy = phase.step === "wallet" || phase.step === "confirming";

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function confirm(txId: string, refundAmount: string) {
    setPhase({ step: "confirming", txId, amount: refundAmount });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/refunds/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, amount: refundAmount, reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not confirm the refund.");
      if (payload?.data?.status === "recorded") {
        setPhase({ step: "done", amount: refundAmount });
        onRefunded();
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
    }
    setPhase({ step: "stalled", txId, amount: refundAmount });
  }

  async function start() {
    setError(null);
    setPhase({ step: "wallet" });
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not prepare the refund.");
      const prepared = payload.data as Prepared;
      const callbacks = {
        onCancel: () => {
          setPhase({ step: "form" });
          setError("The refund was canceled in your wallet.");
          window.requestAnimationFrame(() => amountRef.current?.focus());
        },
        onFinish: ({ txId }: { txId: string }) => {
          confirm(txId, prepared.amount).catch((confirmError) => {
            setPhase({ step: "stalled", txId, amount: prepared.amount });
            setError(confirmError instanceof Error ? confirmError.message : "Could not confirm the refund.");
          });
        },
      };
      if (prepared.transfer.kind === "stx") await submitStxTransfer(prepared.transfer, callbacks);
      else await submitContractIntent(prepared.transfer.intent, callbacks);
    } catch (startError) {
      setPhase({ step: "form" });
      setError(startError instanceof Error ? startError.message : "Could not start the refund.");
      // The submit button was disabled while busy, so focus would otherwise fall to the page.
      window.requestAnimationFrame(() => amountRef.current?.focus());
    }
  }

  function retry(txId: string, refundAmount: string) {
    setError(null);
    confirm(txId, refundAmount).catch((confirmError) => {
      setPhase({ step: "stalled", txId, amount: refundAmount });
      setError(confirmError instanceof Error ? confirmError.message : "Could not confirm the refund.");
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      aria-labelledby="refund-title"
      className="card m-auto w-[calc(100%-32px)] max-w-[440px] p-0 text-fg backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="refund-title" className="text-lg font-semibold">Refund payment</h2>
          <p className="mt-0.5 text-sm text-muted">Sent from your connected wallet, not your processor balance, back to the wallet that paid.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-icon -m-2" aria-label="Close" disabled={busy} onClick={() => dialogRef.current?.close()}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {phase.step === "done" ? (
          <p role="status" className="text-sm text-fg-2">
            Refunded {phase.amount} {currency}. The customer has the funds and your webhook endpoints received <code>invoice.refunded</code>.
          </p>
        ) : phase.step === "confirming" ? (
          <p role="status" aria-live="polite" className="flex items-start gap-2.5 text-sm text-fg-2">
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-accent-text" aria-hidden="true" />
            Waiting for the transfer to confirm on Stacks…
          </p>
        ) : phase.step === "stalled" ? (
          <p role="status" className="text-sm text-fg-2">
            The transfer was broadcast but hasn’t confirmed yet. It will be recorded once it does — check again in a minute.
            <span className="mt-1 block break-all font-mono text-xs text-muted">{phase.txId}</span>
          </p>
        ) : (
          <>
            <label className="block">
              <span className="text-sm font-medium">Amount ({currency})</span>
              <input
                ref={amountRef}
                className="field mt-1.5 tabular-nums"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={busy}
                aria-describedby="refund-remaining"
              />
              <span id="refund-remaining" className="mt-1 block text-sm text-muted">Up to {refundable} {currency} can be refunded.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Reason <span className="font-normal text-muted">(optional)</span></span>
              <input className="field mt-1.5" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
            </label>
          </>
        )}
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-line p-5">
        {phase.step === "done" ? (
          <button type="button" className="btn btn-primary" onClick={() => dialogRef.current?.close()}>Done</button>
        ) : phase.step === "stalled" ? (
          <button type="button" className="btn btn-primary" onClick={() => retry(phase.txId, phase.amount)}>Check again</button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy || !/^\d+(\.\d+)?$/.test(amount.trim())} onClick={() => void start()}>
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Undo2 size={18} aria-hidden="true" />}
              {phase.step === "wallet" ? "Confirm in wallet…" : "Refund"}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
