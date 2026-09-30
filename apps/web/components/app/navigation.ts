import { ArrowDownToLine, Code2, FileText, LayoutDashboard, Link2, QrCode, Settings2, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const consoleNavigation: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Payment links", href: "/payment-links", icon: Link2 },
  { label: "Universal QR", href: "/qr-link", icon: QrCode },
  { label: "Settlements", href: "/settlements", icon: ArrowDownToLine },
  { label: "Merchant profile", href: "/profile", icon: Settings2 },
  { label: "Developer", href: "/developer", icon: Code2 },
];

const extraTitles: Record<string, string> = {
  "/create-invoice": "Create invoice",
};

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function currentTitle(pathname: string) {
  return consoleNavigation.find(item => isActive(pathname, item.href))?.label ?? extraTitles[pathname] ?? "Console";
}
