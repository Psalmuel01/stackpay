import type { Metadata } from "next";
import { openGraph } from "@/lib/site";
export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Accept sBTC, STX and USDCx with StackPay: hosted checkout, payment links, Counter Mode, refunds, the /api/v1 reference, signed webhooks and the TypeScript SDK.",
  alternates: { canonical: "/docs" },
  openGraph: openGraph({ url: "/docs", title: "StackPay documentation", description: "Hosted checkout, payment links, Counter Mode, refunds, the /api/v1 reference, signed webhooks and the TypeScript SDK." }),
};
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
