"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { ArrowUpRight } from "lucide-react";
export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0c0e]/95 backdrop-blur-xl">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="StackPay home">
          <Logo size={38} />
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-4 sm:gap-7"
        >
          <Link
            href="/#product"
            className="hidden text-sm text-white/60 hover:text-white sm:block"
          >
            Product
          </Link>
          <Link
            href="/docs"
            aria-current={pathname === "/docs" ? "page" : undefined}
            className={`text-sm hover:text-white ${pathname === "/docs" ? "text-[#ff9069]" : "text-white/60"}`}
          >
            Docs
          </Link>
          <Link href="/dashboard" className="secondary-button">
            Workspace <ArrowUpRight size={15} className="hidden sm:block" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
