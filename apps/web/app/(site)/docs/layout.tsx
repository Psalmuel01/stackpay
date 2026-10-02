import type { Metadata } from "next";
import Footer from "@/components/Footer";
import { openGraph } from "@/lib/site";
import { DocsMobileNav, DocsSidebar } from "./DocsNav";

export const metadata: Metadata = {
  title: { default: "Documentation", template: "%s — StackPay docs" },
  description:
    "StackPay docs: hosted checkout, payment links, Counter Mode, refunds, the REST API, signed webhooks and the TypeScript SDK.",
  alternates: { canonical: "/docs" },
  openGraph: openGraph({ url: "/docs", title: "StackPay documentation", description: "Checkout, payment links, refunds, the REST API, signed webhooks and the TypeScript SDK." }),
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main-content" className="mx-auto max-w-6xl px-4 sm:px-6">
        <DocsMobileNav />
        <div className="grid gap-8 py-10 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-16 lg:py-14">
          <DocsSidebar />
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
