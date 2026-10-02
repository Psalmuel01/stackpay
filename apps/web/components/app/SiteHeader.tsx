"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { ArrowUpRight } from "lucide-react";
export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6">
        <Link href="/" aria-label="StackPay home" className="rounded-control">
          <Logo size={32} />
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-1 sm:gap-2"
        >
          <Link
            href="/#product"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-subtle hover:text-fg sm:block"
          >
            Product
          </Link>
          <Link
            href="/docs"
            aria-current={pathname.startsWith("/docs") ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-subtle hover:text-fg ${pathname.startsWith("/docs") ? "text-fg" : "text-muted"}`}
          >
            Docs
          </Link>
          <Link href="/dashboard" className="btn btn-secondary btn-sm ml-1 sm:ml-2">
            Open console <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
