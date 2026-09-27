import { timingSafeEqual } from "node:crypto";
import { apiFailure, jsonError, jsonOk, logTransactionResponse } from "@/lib/server/http";
import { processChainhookInvoicePaidEvent } from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

function isAuthorized(request: Request) {
  const expectedSecret = process.env.STACKPAY_CHAINHOOK_SECRET ?? "";
  if (!expectedSecret) {
    return false;
  }

  const headerSecret =
    request.headers.get("x-stackpay-chainhook-secret") ??
    request.headers.get("x-chainhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  const actual = Buffer.from(headerSecret);
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getArchitectureContractId() {
  return process.env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID ?? "";
}

function unwrapClarityValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(unwrapClarityValue);
  }

  if (typeof value !== "object") {
    return value;
  }

  if ("type" in value && "value" in value) {
    if (value.type === "tuple" && value.value && typeof value.value === "object") {
      return Object.fromEntries(
        Object.entries(value.value).map(([key, nested]) => [key, unwrapClarityValue(nested)])
      );
    }

    return unwrapClarityValue(value.value);
  }

  if ("repr" in value && typeof value.repr === "string" && Object.keys(value).length === 1) {
    return value.repr;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, unwrapClarityValue(nested)])
  );
}

function collectObjects(root: unknown): any[] {
  if (root === null || root === undefined) {
    return [];
  }

  if (Array.isArray(root)) {
    return root.flatMap(collectObjects);
  }

  if (typeof root !== "object") {
    return [];
  }

  const value = root as Record<string, unknown>;
  return [value, ...Object.values(value).flatMap(collectObjects)];
}

function getNestedValue(candidate: Record<string, unknown>, path: string[]) {
  let current: unknown = candidate;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function extractTupleFieldFromRepr(repr: string, field: string) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\(${escapedField} ([^)]+)\\)`).exec(repr);
  if (!match) {
    return null;
  }

  const rawValue = match[1].trim();

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1);
  }

  if (rawValue.startsWith("u") && /^\d+$/.test(rawValue.slice(1))) {
    return rawValue.slice(1);
  }

  if (rawValue.startsWith("'")) {
    return rawValue.slice(1);
  }

  return rawValue;
}

function normalizeDecodedEvent(decoded: unknown) {
  if (!decoded) {
    return null;
  }

  if (typeof decoded === "string") {
    const eventName = extractTupleFieldFromRepr(decoded, "event");
    if (!eventName) {
      return null;
    }

    return {
      event: eventName,
      "invoice-id": extractTupleFieldFromRepr(decoded, "invoice-id"),
      "receipt-id": extractTupleFieldFromRepr(decoded, "receipt-id"),
      payer: extractTupleFieldFromRepr(decoded, "payer"),
      merchant: extractTupleFieldFromRepr(decoded, "merchant"),
      amount: extractTupleFieldFromRepr(decoded, "amount"),
      currency: extractTupleFieldFromRepr(decoded, "currency"),
    };
  }

  if (typeof decoded !== "object") {
    return null;
  }

  if ("repr" in decoded && typeof (decoded as Record<string, unknown>).repr === "string") {
    return normalizeDecodedEvent((decoded as Record<string, unknown>).repr);
  }

  return decoded as Record<string, unknown>;
}

function getEventEnvelope(payload: Record<string, unknown>) {
  const eventRoot =
    payload.event && typeof payload.event === "object"
      ? (payload.event as Record<string, unknown>)
      : payload;

  return {
    apply: Array.isArray(eventRoot.apply) ? (eventRoot.apply as Record<string, unknown>[]) : [],
    rollback: Array.isArray(eventRoot.rollback) ? (eventRoot.rollback as Record<string, unknown>[]) : [],
  };
}

function extractInvoicePaidEventsFromBlocks(
  blocks: Record<string, unknown>[],
  contractId: string
) {
  const results: Array<{
    txId: string;
    invoiceId: string;
    receiptId: string;
    payerWalletAddress: string | null;
    merchantPrincipal: string | null;
    amount: number | null;
    currency: string | null;
  }> = [];

  for (const block of blocks) {
    const transactions = Array.isArray(block.transactions) ? (block.transactions as Record<string, unknown>[]) : [];

    for (const transaction of transactions) {
      const txId = String(
        getNestedValue(transaction, ["transaction_identifier", "hash"]) ??
          getNestedValue(transaction, ["metadata", "tx_id"]) ??
          ""
      ).trim();
      const operations = Array.isArray(transaction.operations)
        ? (transaction.operations as Record<string, unknown>[])
        : [];

      for (const operation of operations) {
        if (String(operation.type ?? "").trim() !== "contract_log") {
          continue;
        }

        const contractIdentifier = String(
          getNestedValue(operation, ["metadata", "contract_identifier"]) ??
            operation.contract_identifier ??
            ""
        ).trim();

        if (contractId && contractIdentifier !== contractId) {
          continue;
        }

        const decoded = normalizeDecodedEvent(
          unwrapClarityValue(getNestedValue(operation, ["metadata", "decoded_value"])) ??
            unwrapClarityValue(getNestedValue(operation, ["metadata", "decodedValue"])) ??
            unwrapClarityValue(getNestedValue(operation, ["metadata", "value"])) ??
            unwrapClarityValue(operation.value)
        );

        if (!decoded || typeof decoded !== "object") {
          continue;
        }

        const event = decoded as Record<string, unknown>;
        if (String(event.event ?? "").trim() !== "invoice-paid") {
          continue;
        }

        results.push({
          txId,
          invoiceId: String(event["invoice-id"] ?? "").trim(),
          receiptId: String(event["receipt-id"] ?? "").trim(),
          payerWalletAddress: String(event.payer ?? "").trim() || null,
          merchantPrincipal: String(event.merchant ?? "").trim() || null,
          amount: Number(event.amount ?? 0) || null,
          currency: String(event.currency ?? "").trim() || null,
        });
      }
    }
  }

  return results.filter((value) => Boolean(value.txId && value.invoiceId && value.receiptId));
}

function extractInvoicePaidEvents(payload: Record<string, unknown>) {
  const contractId = getArchitectureContractId();
  const { apply, rollback } = getEventEnvelope(payload);
  const operationMatches = extractInvoicePaidEventsFromBlocks([...apply, ...rollback], contractId);

  if (operationMatches.length > 0) {
    return operationMatches;
  }

  const candidates = collectObjects(payload);

  return candidates
    .map((candidate) => {
      const eventType = String(
        candidate.type ??
          candidate.event_type ??
          candidate.kind ??
          getNestedValue(candidate, ["type"]) ??
          ""
      ).trim();

      if (
        eventType &&
        !["SmartContractEvent", "smart_contract_event", "contract_log"].includes(eventType)
      ) {
        return null;
      }

      const contractIdentifier =
        String(
          candidate.contract_identifier ??
            candidate.contractIdentifier ??
            candidate.smart_contract_id ??
            candidate.contract_id ??
            getNestedValue(candidate, ["metadata", "contract_identifier"]) ??
            getNestedValue(candidate, ["data", "contract_identifier"]) ??
            getNestedValue(candidate, ["contract_event", "contract_identifier"]) ??
            getNestedValue(candidate, ["smart_contract_event", "contract_identifier"]) ??
            ""
        ).trim();

      if (contractId && contractIdentifier && contractIdentifier !== contractId) {
        return null;
      }

      const decoded = normalizeDecodedEvent(
        unwrapClarityValue(candidate.decoded_value) ??
          unwrapClarityValue(candidate.decodedValue) ??
          unwrapClarityValue(getNestedValue(candidate, ["metadata", "decoded_value"])) ??
          unwrapClarityValue(getNestedValue(candidate, ["metadata", "decodedValue"])) ??
          unwrapClarityValue(getNestedValue(candidate, ["data", "decoded_value"])) ??
          unwrapClarityValue(getNestedValue(candidate, ["data", "decodedValue"])) ??
          unwrapClarityValue(getNestedValue(candidate, ["contract_event", "decoded_value"])) ??
          unwrapClarityValue(getNestedValue(candidate, ["smart_contract_event", "decoded_value"])) ??
          unwrapClarityValue(getNestedValue(candidate, ["metadata", "value"])) ??
          unwrapClarityValue(candidate.value) ??
          unwrapClarityValue(getNestedValue(candidate, ["data", "value"]))
      );

      if (!decoded || typeof decoded !== "object") {
        return null;
      }

      const eventName = String((decoded as Record<string, unknown>).event ?? "").trim();
      if (eventName !== "invoice-paid") {
        return null;
      }

      const txId =
        String(
          candidate.tx_id ??
            candidate.txid ??
            candidate.transaction_identifier?.hash ??
            candidate.transaction?.tx_id ??
            getNestedValue(candidate, ["tx", "tx_id"]) ??
            getNestedValue(candidate, ["metadata", "tx_id"]) ??
            getNestedValue(candidate, ["transaction", "transaction_identifier", "hash"]) ??
            ""
        ).trim();

      return {
        txId,
        invoiceId: String((decoded as Record<string, unknown>)["invoice-id"] ?? "").trim(),
        receiptId: String((decoded as Record<string, unknown>)["receipt-id"] ?? "").trim(),
        payerWalletAddress: String((decoded as Record<string, unknown>).payer ?? "").trim() || null,
        merchantPrincipal: String((decoded as Record<string, unknown>).merchant ?? "").trim() || null,
        amount: Number((decoded as Record<string, unknown>).amount ?? 0) || null,
        currency: String((decoded as Record<string, unknown>).currency ?? "").trim() || null,
      };
    })
    .filter((value): value is NonNullable<typeof value> => {
      return Boolean(value?.invoiceId && value?.receiptId && value?.txId);
    });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  if (!isAuthorized(request)) {
    return jsonError(401, "unauthorized", "Invalid Chainhook secret.");
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const envelope = getEventEnvelope(payload);
    const phase = envelope.rollback.length > 0 ? "rollback" : "apply";
    const matches = extractInvoicePaidEvents(payload);

    const results = [];
    for (const match of matches) {
      results.push(
        await processChainhookInvoicePaidEvent({
          phase,
          txId: match.txId,
          invoiceId: match.invoiceId,
          receiptId: match.receiptId,
          payerWalletAddress: match.payerWalletAddress,
          merchantPrincipal: match.merchantPrincipal,
          amount: match.amount,
          currency:
            match.currency === "STX" || match.currency === "sBTC" || match.currency === "USDCx"
              ? match.currency
              : null,
          payload,
        })
      );
    }

    const responsePayload = {
      received: true,
      phase,
      matchedEvents: matches.length,
      results,
    };

    if (matches.length === 0) {
      logTransactionResponse("chainhooks.webhook.unmatched", {
        topLevelKeys: Object.keys(payload),
        eventKeys: payload.event && typeof payload.event === "object" ? Object.keys(payload.event as Record<string, unknown>) : [],
        applyCount: envelope.apply.length,
        rollbackCount: envelope.rollback.length,
        sample: envelope.apply[0] ?? envelope.rollback[0] ?? null,
      });
    }

    logTransactionResponse("chainhooks.webhook", responsePayload);
    return jsonOk(responsePayload, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
