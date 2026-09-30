import { selectRows } from "./supabase-admin";
import { decimalToAtomic, sumDecimalAmounts, type PaymentCurrency } from "../amounts";

/**
 * Reconciliation export: one row per invoice correlating the merchant's own ids (metadata) with the
 * StackPay invoice, the on-chain invoice and payment transaction, the receipt, and current status.
 * Amounts are exact. No fiat values: StackPay has no trustworthy, timestamped price source yet.
 */

type Row = Record<string, any>;
const PAGE = 500;

export const RECONCILIATION_COLUMNS = [
  "invoice_id", "invoice_status", "created_at", "expires_at", "paid_at", "amount", "amount_units", "currency",
  "description", "customer_name", "customer_email", "onchain_invoice_id", "creation_tx_id",
  "receipt_id", "onchain_receipt_id", "payment_tx_id", "payer", "block_height", "receipt_status", "receipt_pdf_url",
  "creation_source", "metadata_json",
] as const;

/** RFC 4180 quoting plus protection against spreadsheet formula injection. */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exact(value: unknown, currency: PaymentCurrency) {
  try {
    const amount = sumDecimalAmounts([String(value ?? "0")], currency);
    return { amount, units: decimalToAtomic(amount, currency).toString() };
  } catch {
    return { amount: String(value ?? ""), units: "" };
  }
}

export type ReconciliationFilters = { from?: string | null; to?: string | null; status?: string | null };

function filterQuery(merchantId: string, filters: ReconciliationFilters) {
  const query: Record<string, string> = { merchant_id: `eq.${merchantId}` };
  const and: string[] = [];
  if (filters.from) and.push(`created_at.gte.${new Date(filters.from).toISOString()}`);
  if (filters.to) and.push(`created_at.lt.${new Date(filters.to).toISOString()}`);
  if (and.length) query.and = `(${and.join(",")})`;
  if (filters.status) query.status = `eq.${filters.status}`;
  return query;
}

export function validateFilters(filters: ReconciliationFilters) {
  for (const key of ["from", "to"] as const) {
    if (filters[key] && !Number.isFinite(Date.parse(filters[key]!))) return `${key} must be an ISO date.`;
  }
  if (filters.status && !["draft", "pending", "paid", "expired", "canceled"].includes(filters.status)) return "status is invalid.";
  return null;
}

/** Streams the export as CSV, reading the database in keyset-paginated chunks. */
export function reconciliationCsvStream(merchantId: string, origin: string, filters: ReconciliationFilters, metadataKeys: string[] = []) {
  const encoder = new TextEncoder();
  const header = [...RECONCILIATION_COLUMNS, ...metadataKeys.map((key) => `metadata.${key}`)];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`${header.map(csvCell).join(",")}\r\n`));
        let cursor: { createdAt: string; id: string } | null = null;
        for (;;) {
          const query: Record<string, string | number> = { ...filterQuery(merchantId, filters), select: "*,amount_text:amount::text", order: "created_at.desc,id.desc", limit: PAGE };
          if (cursor) query.or = `(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`;
          const invoices = (await selectRows("invoices", query)) as Row[];
          if (!invoices.length) break;
          const receipts = (await selectRows("receipts", { select: "*", invoice_id: `in.(${invoices.map((row) => row.id).join(",")})`, order: "created_at.desc" })) as Row[];
          const receiptByInvoice = new Map<string, Row>();
          for (const receipt of receipts) {
            const current = receiptByInvoice.get(String(receipt.invoice_id));
            if (!current || (current.status !== "confirmed" && receipt.status === "confirmed")) receiptByInvoice.set(String(receipt.invoice_id), receipt);
          }
          const lines = invoices.map((invoice) => {
            const receipt = receiptByInvoice.get(String(invoice.id));
            const money = exact(invoice.amount_text ?? invoice.amount, invoice.currency as PaymentCurrency);
            const metadata = (invoice.metadata ?? {}) as Record<string, unknown>;
            const values = [
              invoice.public_id, invoice.status, invoice.created_at, invoice.expires_at, invoice.paid_at, money.amount, money.units, invoice.currency,
              invoice.description, invoice.customer_name, invoice.customer_email, invoice.onchain_invoice_id, invoice.tx_id,
              receipt?.public_id, receipt?.onchain_receipt_id, receipt?.tx_id, receipt?.payer_wallet_address, receipt?.block_height, receipt?.status,
              receipt?.onchain_receipt_id ? `${origin}/api/receipts/${receipt.onchain_receipt_id}/pdf` : "",
              invoice.creation_source, metadata,
              ...metadataKeys.map((key) => metadata[key]),
            ];
            return values.map(csvCell).join(",");
          });
          controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
          if (invoices.length < PAGE) break;
          const last = invoices[invoices.length - 1];
          cursor = { createdAt: String(last.created_at), id: String(last.id) };
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
