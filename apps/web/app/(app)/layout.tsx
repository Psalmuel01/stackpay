import type { Metadata } from "next";
import ConsoleShell from "@/components/app/ConsoleShell";

// The merchant console is private: keep it out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
