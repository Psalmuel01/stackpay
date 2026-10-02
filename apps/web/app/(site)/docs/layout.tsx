import type { Metadata } from "next";
import { openGraph } from "@/lib/site";
export const metadata: Metadata = {
  title: "Documentation",
  description:
    "StackPay docs: hosted checkout, payment links, Counter Mode, refunds, the REST API, signed webhooks and the TypeScript SDK.",
  alternates: { canonical: "/docs" },
  openGraph: openGraph({ url: "/docs", title: "StackPay documentation", description: "Checkout, payment links, refunds, the REST API, signed webhooks and the TypeScript SDK." }),
};
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
