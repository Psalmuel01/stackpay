"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Plus, Link2, Menu, QrCode, ArrowDownToLine, Settings2, BookOpen, ExternalLink, Code2 } from "lucide-react";
import { isActive } from "./navigation";

const dock = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Create", href: "/create-invoice", icon: Plus },
  { label: "Links", href: "/payment-links", icon: Link2 },
];

const more = [
  { label: "Universal QR", href: "/qr-link", icon: QrCode },
  { label: "Settlements", href: "/settlements", icon: ArrowDownToLine },
  { label: "Merchant profile", href: "/profile", icon: Settings2 },
  { label: "Developer", href: "/developer", icon: Code2 },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Back to website", href: "/", icon: ExternalLink },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = more.some(item => item.href !== "/" && isActive(pathname, item.href));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && <>
        <div className="mobile-sheet-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
        <div id="mobile-more" className="mobile-sheet" role="dialog" aria-modal="true" aria-label="More pages">
          <div className="mobile-sheet-handle" aria-hidden="true" />
          <nav aria-label="More pages">
            {more.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href} aria-current={href !== "/" && isActive(pathname, href) ? "page" : undefined}>
                <Icon size={20} aria-hidden="true" />{label}
              </Link>
            ))}
          </nav>
        </div>
      </>}
      <nav aria-label="Primary" className="mobile-dock">
        {dock.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          if (href === "/create-invoice") {
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label="Create invoice" className="mobile-dock-item"><span className="mobile-dock-create"><Icon size={22} aria-hidden="true" /></span></Link>;
          }
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className="mobile-dock-item"><Icon size={21} aria-hidden="true" />{label}</Link>;
        })}
        <button type="button" className="mobile-dock-item" aria-expanded={open} aria-controls="mobile-more" aria-current={moreActive ? "page" : undefined} onClick={() => setOpen(value => !value)}>
          <Menu size={21} aria-hidden="true" />More
        </button>
      </nav>
    </>
  );
}
