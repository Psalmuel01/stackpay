import { z } from "zod";
import { ApiError } from "./api-error";
import { audit } from "./audit";
import { callRpc, selectRows } from "./supabase-admin";
import { syncVerifiedTransaction, tokenContracts } from "./stacks-api";
import { refundMemo, memoHex, verifyRefundPayload, type ExpectedRefund } from "./refund-verification";
import { atomicToDecimal, decimalToAtomic, type PaymentCurrency } from "../amounts";
import { normalizeTransactionId } from "../transaction-id";

/**
 * Refunds are ordinary transfers from the merchant's wallet back to the original payer. StackPay
 * never moves the money itself: it prepares the exact transfer, and records the refund only after
 * the anchored transaction has been verified (sender, recipient, asset, amount, memo).
 */

type Row = Record<string, any>;
type Merchant = { id: string; wallet: string };

const INVOICE_REF = /^(inv_[0-9a-f]{24}|[A-Za-z0-9_-]{1,85})$/;

export const refundAmountSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a decimal string."),
});
export const confirmRefundSchema = refundAmountSchema.extend({
  txId: z.string(),
  reason: z.string().max(200).optional().default(""),
});

function network() {
  return process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

async function loadRefundable(merchant: Merchant, invoiceRef: string) {
  if (!INVOICE_REF.test(invoiceRef)) throw new ApiError(404, "invoice_not_found", "Invoice not found.");
  const column = invoiceRef.startsWith("inv_") ? "public_id" : "onchain_invoice_id";
  const [invoice] = (await selectRows("invoices", {
    select: "*,amount_text:amount::text,refunded_text:refunded_amount::text",
    [column]: `eq.${invoiceRef}`,
    merchant_id: `eq.${merchant.id}`,
    limit: 1,
  })) as Row[];
  if (!invoice) throw new ApiError(404, "invoice_not_found", "Invoice not found.");
  if (!["paid", "refunded"].includes(invoice.status)) throw new ApiError(409, "invoice_not_refundable", "Only paid invoices can be refunded.");
  const [receipt] = (await selectRows("receipts", {
    select: "payer_wallet_address,public_id",
    invoice_id: `eq.${invoice.id}`,
    status: "eq.confirmed",
    limit: 1,
  })) as Row[];
  if (!receipt?.payer_wallet_address) throw new ApiError(409, "invoice_not_refundable", "The payment for this invoice has no confirmed payer.");
  const currency = invoice.currency as PaymentCurrency;
  const remaining = decimalToAtomic(String(invoice.amount_text ?? invoice.amount), currency) - decimalToAtomic(String(invoice.refunded_text ?? "0"), currency);
  return { invoice, currency, payer: String(receipt.payer_wallet_address), remaining };
}

function checkAmount(amount: string, currency: PaymentCurrency, remaining: bigint) {
  let units: bigint;
  try {
    units = decimalToAtomic(amount, currency);
  } catch {
    throw new ApiError(400, "invalid_amount", `Amount has too many decimal places for ${currency}.`);
  }
  if (units <= 0n) throw new ApiError(400, "invalid_amount", "Refund amount must be greater than zero.");
  if (units > remaining) throw new ApiError(409, "refund_exceeds_remaining", `At most ${atomicToDecimal(remaining, currency)} ${currency} can still be refunded.`);
  return units;
}

function expectedRefund(merchant: Merchant, payer: string, currency: PaymentCurrency, units: bigint, memo: string): ExpectedRefund {
  return {
    network: network(),
    sender: merchant.wallet,
    recipient: payer,
    amountUnits: units.toString(),
    memo,
    tokenContract: currency === "STX" ? null : tokenContracts[currency],
  };
}

/** The exact wallet request the merchant signs to refund the payer. */
export async function prepareRefund(merchant: Merchant, invoiceRef: string, input: z.infer<typeof refundAmountSchema>) {
  const { invoice, currency, payer, remaining } = await loadRefundable(merchant, invoiceRef);
  const units = checkAmount(input.amount, currency, remaining);
  const memo = refundMemo(String(invoice.public_id));
  const base = { invoiceId: invoice.public_id, currency, amount: atomicToDecimal(units, currency), recipient: payer, remaining: atomicToDecimal(remaining, currency) };
  if (currency === "STX") {
    return { ...base, transfer: { kind: "stx" as const, recipient: payer, amountMicroStx: units.toString(), memo, network: network() } };
  }
  const contractId = tokenContracts[currency];
  return {
    ...base,
    transfer: {
      kind: "contract-call" as const,
      intent: {
        contractId,
        contractName: contractId.split(".")[1],
        functionName: "transfer",
        network: network(),
        arguments: [
          { type: "uint" as const, value: units.toString() },
          { type: "principal" as const, value: merchant.wallet },
          { type: "principal" as const, value: payer },
          { type: "optional-buffer" as const, value: memoHex(memo) },
        ],
        notes: [`Refund ${atomicToDecimal(units, currency)} ${currency} to ${payer}`],
      },
    },
  };
}

/** Verifies the broadcast refund on-chain and records it. Pending transactions are safe to retry. */
export async function confirmRefund(merchant: Merchant, invoiceRef: string, input: z.infer<typeof confirmRefundSchema>) {
  const txId = normalizeTransactionId(input.txId);
  if (!txId) throw new ApiError(400, "invalid_tx_id", "A valid transaction id is required.");
  const { invoice, currency, payer } = await loadRefundable(merchant, invoiceRef);
  let units: bigint;
  try {
    units = decimalToAtomic(input.amount, currency);
  } catch {
    throw new ApiError(400, "invalid_amount", `Amount has too many decimal places for ${currency}.`);
  }
  if (units <= 0n) throw new ApiError(400, "invalid_amount", "Refund amount must be greater than zero.");

  const expected = expectedRefund(merchant, payer, currency, units, refundMemo(String(invoice.public_id)));
  const sync = await syncVerifiedTransaction(txId, (payload, id) => verifyRefundPayload(payload, id, expected));
  if (sync.status === "pending") return { status: "pending" as const, txId };
  if (sync.status !== "success") throw new ApiError(422, "refund_failed", `The refund transaction did not succeed (${sync.status}).`);

  const result = await callRpc<Row>("record_refund", {
    p_merchant_id: merchant.id,
    p_invoice_id: invoice.id,
    p_tx_id: txId,
    p_amount: atomicToDecimal(units, currency),
    p_recipient: payer,
    p_reason: input.reason ?? "",
    p_block_height: sync.blockHeight,
  });
  switch (result.outcome) {
    case "recorded":
      await audit({ merchantId: merchant.id, actorType: "wallet", actorId: merchant.wallet, action: "refund.recorded", targetType: "invoice", targetId: String(invoice.public_id), metadata: { tx_id: txId, amount: atomicToDecimal(units, currency), currency } });
    // falls through
    case "exists":
      // jsonb numerics can arrive in exponent form; the verified amount is authoritative.
      return { status: "recorded" as const, refund: serializeRefund({ ...result.refund, amount_text: atomicToDecimal(units, currency) }, currency) };
    case "exceeds_remaining":
      // The transfer happened on-chain but exceeds what the invoice can account for; surface it loudly.
      throw new ApiError(409, "refund_exceeds_remaining", "This transfer is larger than the refundable balance; it was not recorded.");
    case "conflict":
      throw new ApiError(409, "refund_conflict", "This transaction is already recorded for a different refund.");
    default:
      throw new ApiError(409, "invoice_not_refundable", "This invoice can no longer be refunded.");
  }
}

export async function listRefunds(merchant: Merchant, invoiceRef: string) {
  if (!INVOICE_REF.test(invoiceRef)) throw new ApiError(404, "invoice_not_found", "Invoice not found.");
  const column = invoiceRef.startsWith("inv_") ? "public_id" : "onchain_invoice_id";
  const [invoice] = (await selectRows("invoices", { select: "id,currency", [column]: `eq.${invoiceRef}`, merchant_id: `eq.${merchant.id}`, limit: 1 })) as Row[];
  if (!invoice) throw new ApiError(404, "invoice_not_found", "Invoice not found.");
  const rows = (await selectRows("refunds", { select: "*,amount_text:amount::text", invoice_id: `eq.${invoice.id}`, order: "created_at.asc" })) as Row[];
  return rows.map((row) => serializeRefund(row, invoice.currency as PaymentCurrency));
}

export function serializeRefund(row: Row, currency: PaymentCurrency) {
  const amount = atomicToDecimal(decimalToAtomic(String(row.amount_text ?? row.amount), currency), currency);
  return {
    id: row.public_id,
    object: "refund",
    amount,
    amount_units: decimalToAtomic(amount, currency).toString(),
    currency,
    recipient: row.recipient,
    reason: row.reason ?? "",
    tx_id: row.tx_id,
    block_height: row.block_height ?? null,
    created_at: row.created_at,
  };
}
