import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ callRpc: vi.fn(), selectRows: vi.fn(), insertRow: vi.fn(), patchRows: vi.fn(), supabaseRequest: vi.fn(), isSupabaseConfigured: () => true }));
vi.mock("../lib/server/supabase-admin", () => db);

import { csvCell, reconciliationCsvStream, validateFilters } from "../lib/server/reconciliation";
import { GET as apiExport } from "../app/api/v1/reports/reconciliation/route";

function invoice(n: number, overrides: Record<string, unknown> = {}) {
  return { id: `row-${n}`, public_id: `inv_${String(n).padStart(24, "0")}`, status: "paid", created_at: `2026-10-01T00:00:${String(n % 60).padStart(2, "0")}+00:00`, expires_at: null, paid_at: "2026-10-01T01:00:00+00:00", amount: 0.3, amount_text: "0.30000000", currency: "USDCx", description: "Order", customer_name: "Ada", customer_email: "ada@example.com", onchain_invoice_id: `INV_${n}`, tx_id: "0xcreate", creation_source: "api", metadata: { orderId: String(n) }, ...overrides };
}
async function read(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text();
}

beforeEach(() => vi.clearAllMocks());

describe("csv cells", () => {
  it.each([
    ["=HYPERLINK(\"http://evil\")", "\"'=HYPERLINK(\"\"http://evil\"\")\""],
    ["+1234", "'+1234"],
    ["-5", "'-5"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["a,b", "\"a,b\""],
    ["line\nbreak", "\"line\nbreak\""],
    [null, ""],
    [{ orderId: "1" }, "\"{\"\"orderId\"\":\"\"1\"\"}\""],
  ])("escapes %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});

describe("reconciliation export", () => {
  it("correlates invoices, receipts, and metadata with exact amounts", async () => {
    db.selectRows.mockImplementation(async (table: string) => {
      if (table === "invoices") return [invoice(1, { customer_name: "=cmd|' /C calc'!A0" })];
      if (table === "receipts") return [
        { invoice_id: "row-1", public_id: "rcpt_orphan", onchain_receipt_id: "RCP_OLD", tx_id: "0xold", status: "orphaned", created_at: "2026-10-01T00:00:00Z" },
        { invoice_id: "row-1", public_id: "rcpt_1", onchain_receipt_id: "RCP_1", tx_id: "0xpay", payer_wallet_address: "ST1PAYER", block_height: 120, status: "confirmed", created_at: "2026-10-01T00:00:01Z" },
      ];
      return [];
    });
    const csv = await read(reconciliationCsvStream("m1", "https://pay.example.com", {}, ["orderId"]));
    const [header, row] = csv.trim().split("\r\n");
    expect(header.split(",")).toContain("metadata.orderId");
    const cells = row.split(",");
    const column = (name: string) => cells[header.split(",").indexOf(name)];
    expect(column("amount")).toBe("0.3");
    expect(column("amount_units")).toBe("300000");
    expect(column("receipt_id")).toBe("rcpt_1");
    expect(column("payment_tx_id")).toBe("0xpay");
    expect(column("receipt_pdf_url")).toBe("https://pay.example.com/api/receipts/RCP_1/pdf");
    expect(column("metadata.orderId")).toBe("1");
    expect(column("customer_name")).toBe("'=cmd|' /C calc'!A0");
    expect(db.selectRows).toHaveBeenCalledWith("invoices", expect.objectContaining({ merchant_id: "eq.m1" }));
  });

  it("pages through large histories with a keyset cursor", async () => {
    const first = Array.from({ length: 500 }, (_, i) => invoice(i + 2));
    db.selectRows.mockImplementation(async (table: string, query: Record<string, string>) => {
      if (table === "receipts") return [];
      return query.or ? [invoice(1000)] : first;
    });
    const csv = await read(reconciliationCsvStream("m1", "https://x", {}));
    expect(csv.trim().split("\r\n")).toHaveLength(1 + 501);
    expect(db.selectRows).toHaveBeenCalledWith("invoices", expect.objectContaining({ or: expect.stringContaining("id.lt.row-501") }));
  });

  it("validates filters", () => {
    expect(validateFilters({ from: "yesterday" })).toMatch(/from/);
    expect(validateFilters({ status: "refunded" })).toMatch(/status/);
    expect(validateFilters({ from: "2026-10-01", to: "2026-11-01", status: "paid" })).toBeNull();
  });

  it("requires an API key on the API route", async () => {
    const response = await apiExport(new Request("https://pay.example.com/api/v1/reports/reconciliation"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });
});
