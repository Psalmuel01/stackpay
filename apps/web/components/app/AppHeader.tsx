"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ArrowUpRight } from "lucide-react";
import Logo from "@/components/Logo";
import ConnectWalletButton from "./ConnectWalletButton";
import NotificationsButton from "./NotificationsButton";

const navigation = [
  ["Overview", "/dashboard"],
  ["Invoices", "/invoices"],
  ["Payment links", "/payment-links"],
  ["Universal QR", "/qr-link"],
  ["Settlements", "/settlements"],
  ["Profile", "/profile"],
];
export default function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0c0e]/95 backdrop-blur-xl">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="StackPay home">
            <Logo size={36} />
          </Link>
          <span className="hidden border-l border-white/15 pl-4 text-sm text-white/50 sm:block">
            Merchant workspace
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/docs"
            className="hidden items-center gap-2 text-sm text-white/60 hover:text-white sm:flex"
          >
            <BookOpen size={16} />
            Docs
          </Link>
          <NotificationsButton />
          <ConnectWalletButton />
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <nav
          aria-label="Merchant navigation"
          className="flex min-w-0 gap-5 overflow-x-auto text-sm sm:gap-7"
        >
          {navigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`shrink-0 border-b-2 py-4 transition-colors ${pathname === href ? "border-[#fc6532] text-white" : "border-transparent text-white/55 hover:text-white"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/create-invoice"
          className="hidden shrink-0 items-center gap-2 text-sm font-medium text-[#ff9069] hover:text-white md:flex"
        >
          Create invoice <ArrowUpRight size={16} />
        </Link>
      </div>
    </header>
  );
}
