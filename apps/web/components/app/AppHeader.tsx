"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ArrowUpRight, ExternalLink } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import Logo from "@/components/Logo";
import ConnectWalletButton from "./ConnectWalletButton";
import NotificationsButton from "./NotificationsButton";
import { consoleNavigation, currentTitle, isActive } from "./navigation";

export default function AppHeader() {
  const pathname = usePathname();
  const current = currentTitle(pathname);
  const mainnet = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet";
  return <>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="console-sidebar" aria-label="Console">
      <Link href="/" aria-label="StackPay home" className="console-brand"><Logo size={32} /></Link>
      <p className="console-nav-label">Console</p>
      <nav aria-label="Merchant navigation">{consoleNavigation.map(({ label, href, icon: Icon }) => {
        const active = isActive(pathname, href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`console-nav-item ${active ? "selected" : ""}`}><Icon size={18} aria-hidden="true" />{label}</Link>;
      })}</nav>
      <div className="console-sidebar-bottom">
        <div className="console-help"><BookOpen size={18} aria-hidden="true" /><strong>Build with StackPay</strong><p>Integration guides, payment flows, and contract references.</p><Link href="/docs">Read the docs <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        <Link href="/" className="console-nav-item">Back to website <ExternalLink size={15} aria-hidden="true" className="ml-auto" /></Link>
      </div>
    </aside>
    <header className="console-topbar">
      <Link href="/dashboard" aria-label="StackPay console" className="console-topbar-brand"><Logo size={30} /></Link>
      <div className="console-breadcrumb"><Link href="/dashboard">Console</Link><span aria-hidden="true">/</span><strong aria-current="page">{current}</strong></div>
      <div className="console-topbar-actions">
        <span className={`console-network ${mainnet ? "mainnet" : ""}`}><span aria-hidden="true" />{mainnet ? "Mainnet" : "Testnet"}</span>
        <ThemeToggle />
        <NotificationsButton />
        <ConnectWalletButton />
      </div>
    </header>
    <nav aria-label="Section navigation" className="console-tablet-nav">{consoleNavigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>{item.label}</Link>)}</nav>
  </>;
}
