import { consoleRoute } from "@/lib/server/console";
import { selectRows } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

/** Recent confirmed payments for Counter Mode's live feed (polled). */
export const GET = consoleRoute(async (merchant) => {
  const receipts = (await selectRows("receipts", {
    select: "public_id,onchain_receipt_id,invoice_id,currency,paid_at,created_at,payer_wallet_address,amount_text:amount::text",
    merchant_id: `eq.${merchant.id}`,
    status: "eq.confirmed",
    order: "created_at.desc",
    limit: 12,
  })) as Array<Record<string, any>>;
  const invoiceIds = [...new Set(receipts.map((row) => row.invoice_id))];
  const invoices = invoiceIds.length
    ? ((await selectRows("invoices", { select: "id,description", id: `in.(${invoiceIds.join(",")})` })) as Array<Record<string, any>>)
    : [];
  const descriptions = new Map(invoices.map((row) => [row.id, row.description]));
  return {
    body: receipts.map((row) => ({
      id: row.public_id,
      amount: row.amount_text,
      currency: row.currency,
      paid_at: row.paid_at,
      recorded_at: row.created_at,
      payer: row.payer_wallet_address,
      description: descriptions.get(row.invoice_id) ?? "",
    })),
  };
});
