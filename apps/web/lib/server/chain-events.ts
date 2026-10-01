import { ApiError } from "./api-error";
import { callRpc } from "./supabase-admin";
import { getMerchantProfileByWallet, recordInvoiceCreation, verifyInvoicePaymentTransaction, type Currency } from "./stackpay-service";
import { readArchitectureInvoice } from "./stacks-api";
import { atomicToDecimal, parseAtomicUnits } from "../amounts";
import { logEvent } from "./log";

/**
 * Chain event ingestion (P0-02).
 *
 * Chainhook deliveries are parsed into events with a stable chain identity, written to a durable
 * inbox, and projected by a leased worker. Every payment is independently verified against the
 * Stacks API before projection; a chain or database outage leaves the event queued for retry and
 * never produces a false success.
 */

export type ChainEvent = {
  phase: "apply" | "rollback";
  contractId: string;
  eventName: string;
  blockHash: string;
  blockHeight: number | null;
  txId: string;
  eventIndex: number;
  invoiceId: string | null;
  receiptId: string | null;
  data: Record<string, string | null>;
};

type InboxRow = {
  id: number;
  contract_id: string;
  data: Record<string, string | null>;
  phase: "apply" | "rollback";
  event_name: string;
  tx_id: string;
  block_hash: string;
  block_height: number | null;
  invoice_onchain_id: string | null;
  receipt_onchain_id: string | null;
  attempts: number;
};

export const MAX_EVENT_ATTEMPTS = 12;

function get(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in (current as Record<string, unknown>))) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function unwrapClarityValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(unwrapClarityValue);
  const record = value as Record<string, unknown>;
  if ("type" in record && "value" in record) {
    if (record.type === "tuple" && record.value && typeof record.value === "object") {
      return Object.fromEntries(Object.entries(record.value as Record<string, unknown>).map(([key, nested]) => [key, unwrapClarityValue(nested)]));
    }
    return unwrapClarityValue(record.value);
  }
  if ("repr" in record && typeof record.repr === "string" && Object.keys(record).length === 1) return record.repr;
  return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, unwrapClarityValue(nested)]));
}

function tupleFieldFromRepr(repr: string, field: string) {
  const match = new RegExp(`\\(${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ([^)]+)\\)`).exec(repr);
  if (!match) return null;
  const raw = match[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  if (/^u\d+$/.test(raw)) return raw.slice(1);
  if (raw.startsWith("'")) return raw.slice(1);
  return raw;
}

function decodeEvent(decoded: unknown): Record<string, unknown> | null {
  if (!decoded) return null;
  if (typeof decoded === "string") {
    const event = tupleFieldFromRepr(decoded, "event");
    if (!event) return null;
    const fields = ["invoice-id", "receipt-id", "payer", "merchant", "amount", "currency"];
    return { event, ...Object.fromEntries(fields.map((field) => [field, tupleFieldFromRepr(decoded, field)])) };
  }
  if (typeof decoded !== "object") return null;
  const record = decoded as Record<string, unknown>;
  if (typeof record.repr === "string") return decodeEvent(record.repr);
  return record;
}

const text = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result : null;
};

/**
 * Extracts contract print events emitted by the expected contract, preserving block identity.
 * Rollback blocks are returned before apply blocks, matching Chainhook's reorg semantics.
 */
export function parseChainhookPayload(payload: unknown, expectedContracts: string | string[]): ChainEvent[] {
  const allowed = new Set((Array.isArray(expectedContracts) ? expectedContracts : [expectedContracts]).filter(Boolean));
  if (allowed.size === 0) throw new ApiError(503, "contract_not_configured", "The StackPay contracts are not configured.");
  const root = (get(payload, ["event"]) ?? payload) as Record<string, unknown>;
  const events: ChainEvent[] = [];

  for (const phase of ["rollback", "apply"] as const) {
    const blocks = Array.isArray(root?.[phase]) ? (root[phase] as unknown[]) : [];
    for (const block of blocks) {
      const blockHash = text(get(block, ["block_identifier", "hash"]));
      const heightValue = Number(get(block, ["block_identifier", "index"]));
      const blockHeight = Number.isSafeInteger(heightValue) ? heightValue : null;
      if (!blockHash) continue; // Without a block identity the event cannot be deduplicated or rolled back safely.
      const transactions = Array.isArray(get(block, ["transactions"])) ? (get(block, ["transactions"]) as unknown[]) : [];

      for (const transaction of transactions) {
        const txId = text(get(transaction, ["transaction_identifier", "hash"]) ?? get(transaction, ["metadata", "tx_id"]));
        if (!txId) continue;
        const operations = Array.isArray(get(transaction, ["operations"])) ? (get(transaction, ["operations"]) as unknown[]) : [];

        operations.forEach((operation, position) => {
          if (text(get(operation, ["type"])) !== "contract_log") return;
          // Enforced on every path: events from any other contract are ignored.
          const contractId = text(get(operation, ["metadata", "contract_identifier"]) ?? get(operation, ["contract_identifier"]));
          if (!contractId || !allowed.has(contractId)) return;

          const decoded = decodeEvent(
            unwrapClarityValue(get(operation, ["metadata", "decoded_value"])) ??
              unwrapClarityValue(get(operation, ["metadata", "decodedValue"])) ??
              unwrapClarityValue(get(operation, ["metadata", "value"])) ??
              unwrapClarityValue(get(operation, ["value"]))
          );
          const eventName = text(decoded?.event);
          if (!decoded || !eventName) return;

          const indexValue = Number(get(operation, ["operation_identifier", "index"]));
          events.push({
            phase,
            contractId,
            eventName,
            blockHash,
            blockHeight,
            txId,
            eventIndex: Number.isSafeInteger(indexValue) && indexValue >= 0 ? indexValue : position,
            invoiceId: text(decoded["invoice-id"]),
            receiptId: text(decoded["receipt-id"]),
            data: {
              payer: text(decoded.payer),
              merchant: text(decoded.merchant),
              amount: text(decoded.amount),
              currency: text(decoded.currency),
              recipient: text(decoded.recipient),
            },
          });
        });
      }
    }
  }

  return events;
}

/** Writes events to the durable inbox. Returns how many were new work versus duplicates. */
export async function enqueueChainEvents(events: ChainEvent[]) {
  let enqueued = 0;
  for (const event of events) {
    const id = await callRpc<number | null>("enqueue_chain_event", {
      p_phase: event.phase,
      p_contract_id: event.contractId,
      p_event_name: event.eventName,
      p_block_hash: event.blockHash,
      p_block_height: event.blockHeight,
      p_tx_id: event.txId,
      p_event_index: event.eventIndex,
      p_invoice_onchain_id: event.invoiceId,
      p_receipt_onchain_id: event.receiptId,
      p_data: event.data,
    });
    if (id !== null) enqueued += 1;
  }
  return { enqueued, duplicates: events.length - enqueued };
}

class RetryableError extends Error {}
class PermanentError extends Error {}

function isRetryable(error: unknown) {
  if (error instanceof RetryableError) return true;
  if (error instanceof ApiError) return error.status >= 500 || error.status === 404;
  if (error instanceof Error) return ["TimeoutError", "AbortError", "TypeError"].includes(error.name);
  return false;
}

const CURRENCIES = new Set(["STX", "sBTC", "USDCx"]);

/**
 * Recovers an invoice whose interactive confirmation was lost (for example, the merchant closed the
 * tab after signing). The chain is the source of truth: the full invoice is read from the contract.
 */
async function recoverInvoiceCreation(event: InboxRow): Promise<string> {
  if (!event.invoice_onchain_id) throw new PermanentError("event is missing invoice id");
  const onchain = await readArchitectureInvoice(event.invoice_onchain_id);
  if (!onchain) throw new RetryableError("invoice not yet readable on-chain");
  if (!CURRENCIES.has(onchain.currency)) throw new PermanentError(`unsupported currency ${onchain.currency}`);
  const units = parseAtomicUnits(onchain.amountUnits);
  if (units === null || units === 0n) throw new PermanentError("invalid on-chain amount");
  const merchant = await getMerchantProfileByWallet(onchain.merchant);
  if (!merchant) return "unknown_merchant";

  // An API draft paid through the Universal link carries its public id as the description.
  if (/^inv_[0-9a-f]{24}$/.test(onchain.description)) {
    const attached = await callRpc<{ outcome: string }>("attach_draft_invoice", {
      p_public_id: onchain.description,
      p_merchant_id: merchant.id,
      p_onchain_invoice_id: event.invoice_onchain_id,
      p_tx_id: event.tx_id,
      p_amount: atomicToDecimal(units, onchain.currency as Currency),
      p_currency: onchain.currency,
      p_expires_at: Number.isFinite(onchain.expiresAt) && onchain.expiresAt > 0 ? new Date(onchain.expiresAt * 1000).toISOString() : null,
    });
    if (attached.outcome === "attached") return "recovered_draft";
    if (attached.outcome === "already_attached") return "already_recorded";
    // Not a matching draft: fall through and record the chain invoice so the payment is not lost.
  }

  const result = await recordInvoiceCreation({
    merchantId: String(merchant.id),
    onchainInvoiceId: event.invoice_onchain_id,
    txId: event.tx_id,
    amount: atomicToDecimal(units, onchain.currency as Currency),
    currency: onchain.currency as Currency,
    description: onchain.description,
    recipientAddress: onchain.recipient,
    expiresAt: Number.isFinite(onchain.expiresAt) && onchain.expiresAt > 0 ? new Date(onchain.expiresAt * 1000).toISOString() : null,
    source: "chain_recovery",
  }).catch((error) => {
    if (error instanceof ApiError && error.status === 409) throw new PermanentError("invoice id recorded for another transaction");
    throw error;
  });
  return result.creation_source === "chain_recovery" ? "recovered" : "already_recorded";
}

/** Recovers a withdrawal whose interactive confirmation was lost. */
async function recoverSettlement(event: InboxRow): Promise<string> {
  const merchantPrincipal = event.data?.merchant ?? null;
  const currency = event.data?.currency ?? null;
  const units = parseAtomicUnits(event.data?.amount);
  if (!merchantPrincipal || !currency || !CURRENCIES.has(currency) || units === null || units === 0n) {
    throw new PermanentError("settlement event is missing merchant, currency, or amount");
  }
  const merchant = await getMerchantProfileByWallet(merchantPrincipal);
  if (!merchant) return "unknown_merchant";
  const result = await callRpc<{ outcome: string }>("record_settlement", {
    p_merchant_id: merchant.id,
    p_tx_id: event.tx_id,
    p_currency: currency,
    p_amount: atomicToDecimal(units, currency as Currency),
    p_destination: event.data?.recipient ?? merchantPrincipal,
    p_executed_at: null,
    p_source: "chain_recovery",
  });
  if (result.outcome === "conflict") throw new PermanentError("withdrawal recorded for another merchant");
  return result.outcome === "created" ? "recovered" : "already_recorded";
}

async function processApply(event: InboxRow): Promise<string> {
  if (event.event_name === "invoice-created") return recoverInvoiceCreation(event);
  if (event.event_name === "settlement-completed") return recoverSettlement(event);
  if (event.event_name !== "invoice-paid") return "ignored";
  if (!event.invoice_onchain_id || !event.receipt_onchain_id) throw new PermanentError("event is missing invoice or receipt id");

  // Independent verification: the transaction must exist, be anchored, succeed, and match the invoice.
  const sync = await verifyInvoicePaymentTransaction(event.invoice_onchain_id, event.tx_id);
  if (sync.status === "pending") throw new RetryableError("transaction not yet anchored");
  if (sync.status !== "success") throw new PermanentError(`transaction ${sync.status}`);
  if (sync.onchainId !== event.receipt_onchain_id) throw new PermanentError("receipt id does not match the verified transaction");

  const outcome = await callRpc<string>("project_invoice_payment", {
    p_inbox_id: event.id,
    p_invoice_onchain_id: event.invoice_onchain_id,
    p_receipt_onchain_id: event.receipt_onchain_id,
    p_tx_id: sync.txId,
    p_payer: sync.senderAddress,
    p_paid_at: sync.confirmedAt ? new Date(sync.confirmedAt * 1000).toISOString() : null,
    p_block_hash: event.block_hash,
    p_block_height: event.block_height,
  });
  if (outcome === "missing_invoice") throw new RetryableError("invoice not yet recorded");
  if (outcome === "conflict") throw new PermanentError("a different payment is already confirmed for this invoice");
  return outcome;
}

async function processRollback(event: InboxRow): Promise<string> {
  // Creation and withdrawal rollbacks are recorded for audit; a reapply re-records them idempotently.
  if (event.event_name === "invoice-created" || event.event_name === "settlement-completed") return "rollback_noted";
  if (event.event_name !== "invoice-paid" || !event.receipt_onchain_id) return "ignored";
  return callRpc<string>("revert_invoice_payment", {
    p_inbox_id: event.id,
    p_receipt_onchain_id: event.receipt_onchain_id,
    p_tx_id: event.tx_id,
    p_block_hash: event.block_hash,
  });
}

/** Claims and projects due inbox events. Safe to run concurrently and after crashes. */
export async function processChainEventInbox(options: { limit?: number; leaseSeconds?: number } = {}) {
  const claimed = await callRpc<InboxRow[]>("claim_chain_events", {
    p_limit: options.limit ?? 25,
    p_lease_seconds: options.leaseSeconds ?? 60,
  });
  const summary = { claimed: claimed.length, processed: 0, retried: 0, dead: 0 };

  for (const event of claimed) {
    try {
      const outcome = event.phase === "apply" ? await processApply(event) : await processRollback(event);
      await callRpc("complete_chain_event", { p_id: event.id, p_outcome: outcome });
      summary.processed += 1;
      logEvent("chain_event.processed", { inbox_id: event.id, phase: event.phase, outcome, invoice_id: event.invoice_onchain_id, tx_id: event.tx_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const maxAttempts = isRetryable(error) ? MAX_EVENT_ATTEMPTS : 0;
      const result = await callRpc<string>("fail_chain_event", { p_id: event.id, p_error: message, p_max_attempts: maxAttempts });
      if (result === "dead") summary.dead += 1;
      else summary.retried += 1;
      logEvent(result === "dead" ? "chain_event.dead" : "chain_event.retry", { inbox_id: event.id, phase: event.phase, attempts: event.attempts, invoice_id: event.invoice_onchain_id, tx_id: event.tx_id, error: message }, result === "dead" ? "error" : "warn");
    }
  }

  return summary;
}
