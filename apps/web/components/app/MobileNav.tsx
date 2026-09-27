"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Plus,
  QrCode,
  BookOpen,
} from "lucide-react";
const items = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Create", href: "/create-invoice", icon: Plus },
  { label: "QR", href: "/qr-link", icon: QrCode },
  { label: "Docs", href: "/docs", icon: BookOpen },
];
export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Mobile shortcuts"
      className="mobile-dock fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#101114]/95 px-2 pt-2 backdrop-blur-xl md:hidden"
    >
      {items.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${pathname === href ? "bg-[#fc6532]/10 text-[#ff9069]" : "text-white/60 hover:text-white"}`}
        >
          <Icon size={19} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
