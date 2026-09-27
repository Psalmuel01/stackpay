import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Documentation — StackPay",
  description: "Get started with StackPay invoices, MultiPay links, QR checkout, wallet authentication, and manual settlement. Includes API routes and troubleshooting.",
};
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
