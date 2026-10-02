import type { Metadata } from "next";

// Hosted checkout pages are private to the payer: keep them out of search results.
export const metadata: Metadata = {
  title: "Secure checkout",
  robots: { index: false, follow: false },
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
