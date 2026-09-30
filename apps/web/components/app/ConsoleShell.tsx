"use client";
import AppHeader from "./AppHeader";
import MobileNav from "./MobileNav";
import MerchantAuthGate from "./MerchantAuthGate";
export default function ConsoleShell({ children }: { children: React.ReactNode }) {
  return <div className="console-shell">
    <AppHeader />
    <main id="main-content" className="console-main"><div className="console-content"><MerchantAuthGate>{children}</MerchantAuthGate></div></main>
    <MobileNav />
  </div>;
}
