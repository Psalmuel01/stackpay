type ReceiptPdfData = {
  receipt: {
    onchain_receipt_id: string;
    tx_id: string;
    payer_wallet_address: string;
    paid_at: string;
    amount: number;
    currency: "sBTC" | "STX" | "USDCx";
  };
  invoice: {
    onchain_invoice_id: string;
    description: string;
    customer_name: string;
    customer_email: string;
    recipient_address: string;
    created_at: string;
    paid_at: string;
  } | null;
  merchant: {
    company_name: string;
    display_name: string;
    email: string;
    slug: string;
    settlement_wallet: string;
  } | null;
};

const pageWidth = 595;
const pageHeight = 842;
const L = 48;
const R = 547;
const W = R - L;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(v: string) {
  return v
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "' ".trim())
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function escUri(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatAmount(amount: number, currency: "sBTC" | "STX" | "USDCx") {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === "sBTC" ? 8 : 6,
  }).format(amount)} ${currency}`;
}

function formatDate(value: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

function prefixTxId(txId: string) {
  if (!txId) return "Unavailable";
  return txId.startsWith("0x") ? txId : `0x${txId}`;
}

function wrapText(value: string, maxChars: number): string[] {
  const chunks = (value.trim() || "Unavailable").split(/\s+/).flatMap(word => word.match(new RegExp(`.{1,${maxChars}}`, "g")) || []);
  const lines: string[] = [];
  let current = "";
  for (const chunk of chunks) {
    if (current && current.length + chunk.length + 1 > maxChars) { lines.push(current); current = ""; }
    current += (current ? " " : "") + chunk;
  }
  if (current) lines.push(current);
  return lines;
}

type RGB = [number, number, number];
const INK: RGB = [0.12, 0.15, 0.19];
const MUTED: RGB = [0.37, 0.41, 0.46];
const ORANGE: RGB = [0.78, 0.25, 0.08];
function txt(font: "F1" | "F2" | "F3", size: number, x: number, y: number, value: string, color: RGB = INK) {
  return `BT ${color.join(" ")} rg /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(value)}) Tj ET`;
}
function line(y: number) { return `q 0.5 w 0.85 0.87 0.89 RG ${L} ${y} m ${R} ${y} l S Q`; }

// Standard PDF fonts keep receipts dependency-free and printable.
function makePdf(pages: string[][], links: string[][]) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", ...["Helvetica", "Helvetica-Bold", "Courier"].map(font => `<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`)];
  const refs: string[] = [];
  pages.forEach((commands, index) => {
    const pageId = objects.length + 1;
    refs.push(`${pageId} 0 R`);
    const stream = commands.join("\n");
    const annotations = links[index].map((_, i) => `${pageId + 2 + i} 0 R`).join(" ");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageId + 1} 0 R /Annots [${annotations}] >>`, `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`, ...links[index]);
  });
  objects[1] = `<< /Type /Pages /Kids [${refs.join(" ")}] /Count ${pages.length} >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { body += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  return Buffer.from(body + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`, "binary");
}

export function buildReceiptPdf(data: ReceiptPdfData) {
  const network = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const pages: string[][] = [[]];
  const links: string[][] = [[]];
  let out = pages[0];
  let y = 786;
  const newPage = () => {
    out = []; pages.push(out); links.push([]); y = 786;
    out.push(txt("F2", 12, L, y, "StackPay / Receipt continued")); y -= 36;
  };
  const ensure = (height: number) => { if (y - height < 78) newPage(); };
  const field = (label: string, value: string, mono = false) => {
    const rows = wrapText(value, mono ? 88 : 48);
    ensure(48);
    out.push(txt("F2", 8, L, y, label.toUpperCase(), MUTED)); y -= 18;
    rows.forEach(row => { ensure(16); out.push(txt(mono ? "F3" : "F1", mono ? 9 : 11, L, y, row)); y -= 16; });
    y -= 14;
  };
  out.push(txt("F2", 18, L, y, "StackPay", ORANGE));
  out.push(txt("F2", 9, R - 110, y + 2, network === "mainnet" ? "MAINNET RECEIPT" : "TESTNET RECEIPT", MUTED));
  y -= 48;
  out.push(txt("F2", 30, L, y, "Payment receipt")); y -= 28;
  for (const row of wrapText(data.merchant?.company_name || data.merchant?.display_name || "StackPay Merchant", 40)) {
    ensure(20); out.push(txt("F1", 13, L, y, row)); y -= 18;
  }
  y -= 16; ensure(112);
  out.push(`0.96 0.97 0.98 rg ${L} ${y - 88} ${W} 96 re f`);
  out.push(txt("F2", 8, L + 18, y - 12, "AMOUNT PAID", MUTED));
  out.push(txt("F2", 28, L + 18, y - 47, formatAmount(data.receipt.amount, data.receipt.currency)));
  out.push(txt("F2", 9, R - 50, y - 12, "PAID", [0.08, 0.42, 0.28]));
  out.push(txt("F1", 9, L + 18, y - 70, formatDate(data.receipt.paid_at), MUTED));
  y -= 116;
  field("Description", data.invoice?.description || "Payment received via StackPay");
  field("Receipt ID", data.receipt.onchain_receipt_id, true);
  if (data.invoice?.onchain_invoice_id) field("Invoice ID", data.invoice.onchain_invoice_id, true);
  // Private fields are included only when supplied by the authorized receipt projection.
  if (data.invoice?.customer_name) field("Customer", data.invoice.customer_name);
  if (data.invoice?.customer_email) field("Customer email", data.invoice.customer_email);
  field("Payer wallet", data.receipt.payer_wallet_address, true);
  field("Transaction ID", prefixTxId(data.receipt.tx_id), true);
  if (/^(0x)?[a-fA-F0-9]{64}$/.test(data.receipt.tx_id)) {
    ensure(24);
    out.push(txt("F2", 10, L, y, "View transaction on Stacks Explorer", ORANGE));
    const url = `https://explorer.hiro.so/txid/${prefixTxId(data.receipt.tx_id)}?chain=${network}`;
    links[links.length - 1].push(`<< /Type /Annot /Subtype /Link /Rect [${L} ${y - 3} ${L + 210} ${y + 12}] /Border [0 0 0] /A << /S /URI /URI (${escUri(url)}) >> >>`);
  }
  pages.forEach((page, index) => {
    page.push(line(54), txt("F1", 8, L, 36, network === "testnet" ? "Testnet payment. Tokens have no monetary value." : "Payment recorded on Stacks. Keep this receipt for your records.", MUTED), txt("F1", 8, R - 48, 36, `${index + 1} / ${pages.length}`, MUTED));
  });
  return makePdf(pages, links);
}
