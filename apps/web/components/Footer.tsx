import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="border-t border-line py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div>
            <Logo size={32} />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              Invoices, payment links, and QR checkout on Stacks.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-fg-2">
            <Link className="inline-flex min-h-10 items-center hover:text-fg" href="/docs/quickstart">
              Get started
            </Link>
            <Link className="inline-flex min-h-10 items-center hover:text-fg" href="/docs">
              Documentation
            </Link>
            <Link className="inline-flex min-h-10 items-center hover:text-fg" href="/docs/security">
              Security &amp; limits
            </Link>
            <a
              className="inline-flex min-h-10 items-center gap-1 hover:text-fg"
              href="https://github.com/Psalmuel01/stackpay"
            >
              GitHub <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} StackPay</span>
          <span>Testnet preview · Manual settlement</span>
        </div>
      </div>
    </footer>
  );
}
