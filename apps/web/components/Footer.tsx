import Link from "next/link";
import Logo from "@/components/Logo";
export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div>
            <Logo size={34} />
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/50">
              Invoices, payment links, and QR checkout on Stacks.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-6 text-sm text-white/60"
          >
            <Link className="hover:text-white" href="/docs#quickstart">
              Get started
            </Link>
            <Link className="hover:text-white" href="/docs#security">
              Security & limits
            </Link>
            <a
              className="hover:text-white"
              href="https://github.com/Psalmuel01/stackpay"
            >
              GitHub ↗
            </a>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5 text-xs text-white/40">
          <span>© {new Date().getFullYear()} StackPay</span>
          <span>Testnet preview · Manual settlement</span>
        </div>
      </div>
    </footer>
  );
}
