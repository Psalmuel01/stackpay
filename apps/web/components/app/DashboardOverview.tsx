import Link from "next/link";
import { ArrowUpRight, ArrowRight, Plus, FileText, Link2, QrCode, Check, Clock3, ArrowDownToLine, RefreshCw, BookOpen } from "lucide-react";
import PageHeader from "./PageHeader";
import TokenLogo from "@/components/TokenLogo";
import { formatDecimalAmount } from "@/lib/amounts";
type Currency = "sBTC" | "STX" | "USDCx";

export type DashboardResponse = {
  merchant: {
    company_name?: string;
    display_name?: string;
    email?: string;
    slug?: string;
    settlement_wallet?: string | null;
  } | null;
  /** Exact decimal totals of paid invoices per asset. */
  receivedTotals: {
    STX: string;
    sBTC: string;
    USDCx: string;
  };
  stats: {
    paidInvoices: number;
    openInvoices: number;
    activePaymentLinks: number;
    multipayLinks: number;
    universalQrActive: boolean;
  };
  statusBreakdown: {
    paid: number;
    pending: number;
    expired: number;
  };
  activity: Array<{
    id: string;
    title: string;
    detail: string;
    status: "Paid" | "Pending" | "Expired" | "Active" | "Profile";
    createdAt: string;
    href?: string;
  }>;
};

const assets: Array<{ currency: Currency; description: string }> = [
  { currency: "sBTC", description: "Bitcoin-backed" },
  { currency: "STX", description: "Stacks" },
  { currency: "USDCx", description: "US dollar-backed" },
];

export default function DashboardOverview({ data, updatedAt, refreshing, onRefresh }: { data: DashboardResponse; updatedAt?: string; refreshing?: boolean; onRefresh?: () => void }) {
  const name = data.merchant?.company_name || data.merchant?.display_name || "Your business";
  const counts = data.statusBreakdown;
  const total = counts.paid + counts.pending + counts.expired;
  const statuses = [{ label: "Paid", value: counts.paid, style: "paid" }, { label: "Pending", value: counts.pending, style: "pending" }, { label: "Expired", value: counts.expired, style: "expired" }];
  const mainnet = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet";
  return <div className="overview">
    <PageHeader eyebrow={name} title="Overview" subtitle="What’s been paid, what’s still open, and what to do next." actions={<Link href="/create-invoice" className="btn btn-primary"><Plus size={18} aria-hidden="true"/>Create invoice</Link>}/>
    <div className="overview-context">
      <span><span className="context-dot" aria-hidden="true"/>{mainnet ? "Mainnet" : <>Testnet<span className="hidden sm:inline"> — payments use test funds only</span></>}</span>
      <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}><RefreshCw size={15} aria-hidden="true"/>{refreshing ? "Refreshing…" : updatedAt ? `Updated ${updatedAt}` : "Refresh"}</button>
    </div>
    <section aria-labelledby="received-title" className="overview-panel received-panel">
      <div className="panel-heading"><div><h2 id="received-title">Payments received</h2><p>Total from paid invoices, before withdrawals.</p></div><Link href="/settlements" className="console-text-link">Withdraw funds <ArrowUpRight size={16} aria-hidden="true"/></Link></div>
      <div className="received-grid">{assets.map(({ currency, description }) => <div className="received-asset" key={currency}><div className="asset-heading"><TokenLogo token={currency} size={28} /><span>{currency}</span><span className="asset-description">{description}</span></div><p className="received-value">{formatDecimalAmount(data.receivedTotals[currency], currency)}<span>{currency}</span></p></div>)}</div>
    </section>
    <div className="overview-stats">{[
      { label: "Paid invoices", value: data.stats.paidInvoices, detail: "Confirmed on-chain", icon: Check, href: "/invoices" },
      { label: "Awaiting payment", value: data.stats.openInvoices, detail: "Open invoices", icon: Clock3, href: "/invoices" },
      { label: "Active payment links", value: data.stats.activePaymentLinks, detail: "Reusable checkouts", icon: Link2, href: "/payment-links" },
    ].map(({ label, value, detail, icon: Icon, href }) => <Link href={href} className="overview-stat" key={label}><div><span>{label}</span><Icon size={17} aria-hidden="true"/></div><strong>{value}</strong><p>{detail}<ArrowUpRight size={15} aria-hidden="true"/></p></Link>)}</div>
    <div className="overview-columns">
      <section className="overview-panel activity-panel" aria-labelledby="activity-title">
        <div className="panel-heading"><div><h2 id="activity-title">Recent activity</h2><p>Your latest payments and account events.</p></div><Link href="/invoices" className="console-text-link">All invoices <ArrowUpRight size={16} aria-hidden="true"/></Link></div>
        {data.activity.length ? <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th scope="col">Activity</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead><tbody>{data.activity.slice(0, 6).map(item => <tr key={item.id}><td><div className="activity-name"><span className="activity-icon" aria-hidden="true"><FileText size={17}/></span><div><Link href={item.href || "/invoices"}>{item.title}</Link><p>{item.detail}</p></div></div></td><td><span className={`overview-status ${item.status.toLowerCase()}`}>{item.status}</span></td><td className="activity-date">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.createdAt))}<span>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(item.createdAt))}</span></td><td><Link href={item.href || "/invoices"} aria-label={`Open ${item.title}`}><ArrowUpRight size={17} aria-hidden="true"/></Link></td></tr>)}</tbody></table></div> : <div className="overview-empty"><span className="empty-icon" aria-hidden="true"><FileText size={22}/></span><h3>No payments yet</h3><p>Create an invoice and share its checkout link. Payments and account events will show up here.</p><Link href="/create-invoice" className="btn btn-secondary btn-sm">Create your first invoice <ArrowRight size={15} aria-hidden="true"/></Link></div>}
        <div className="activity-footer"><span>Showing up to 6 recent events</span><span>Amounts shown in their original asset</span></div>
      </section>
      <aside className="overview-side">
        <section className="overview-panel invoice-health" aria-labelledby="health-title"><div className="panel-heading"><div><h2 id="health-title">Invoice status</h2><p>{total} {total === 1 ? "invoice" : "invoices"} in total</p></div></div><div className="status-track" aria-hidden="true">{total ? statuses.filter(s => s.value > 0).map(s => <span key={s.label} className={s.style} style={{ width: `${s.value / total * 100}%` }}/>) : <span className="expired" style={{ width: "100%" }}/>}</div><ul>{statuses.map(s => <li key={s.label}><span><i className={s.style} aria-hidden="true"/>{s.label}</span><strong>{s.value}</strong></li>)}</ul>{counts.pending > 0 ? <Link href="/invoices" className="pending-note">{counts.pending} {counts.pending === 1 ? "invoice is" : "invoices are"} awaiting payment <ArrowRight size={15} aria-hidden="true"/></Link> : <p className="health-note">{total ? "Nothing awaiting payment." : "Invoice statuses will appear here."}</p>}</section>
        <section className="overview-qr" aria-labelledby="qr-title"><span className="qr-illustration" aria-hidden="true"><QrCode size={26} strokeWidth={1.75}/></span><p className="eyebrow">Universal QR</p><h2 id="qr-title">Take payments with one QR code</h2><p>{data.stats.universalQrActive ? "Your permanent QR code is live and ready for your next customer." : "A permanent code customers can scan to pay in sBTC, STX, or USDCx."}</p><Link href="/qr-link" className="btn btn-secondary">{data.stats.universalQrActive ? "Open your QR code" : "Set up Universal QR"}<ArrowUpRight size={16} aria-hidden="true"/></Link></section>
      </aside>
    </div>
    <section className="overview-tools" aria-label="More tools">{[
      { title: "Payment links", desc: "A checkout you can share again and again.", href: "/payment-links", icon: Link2 },
      { title: "Settlements", desc: "Check balances and withdraw funds.", href: "/settlements", icon: ArrowDownToLine },
      { title: "Developer docs", desc: "Integrate StackPay into your product.", href: "/docs", icon: BookOpen },
    ].map(({ title, desc, href, icon: Icon }) => <Link href={href} key={title}><span className="tool-icon" aria-hidden="true"><Icon size={18}/></span><div><h3>{title}</h3><p>{desc}</p></div><ArrowUpRight size={16} aria-hidden="true"/></Link>)}</section>
  </div>;
}
