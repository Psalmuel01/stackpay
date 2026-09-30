import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, LayoutDashboard } from "lucide-react";
import StatusScreen from "@/components/StatusScreen";

export const metadata: Metadata = { title: "Page not found — StackPay" };

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="This page doesn’t exist"
      actions={<>
        <Link href="/dashboard" className="btn btn-primary btn-lg"><LayoutDashboard size={18} aria-hidden="true" />Open the console</Link>
        <Link href="/" className="btn btn-secondary btn-lg"><ArrowLeft size={18} aria-hidden="true" />Back to home</Link>
      </>}
    >
      <p>The link may be mistyped, or the page may have moved. If you were opening a payment link, ask the merchant to send it again.</p>
      <p className="mt-6 text-sm">
        Looking for setup help? <Link href="/docs" className="link inline-flex items-center gap-1.5"><BookOpen size={15} aria-hidden="true" />Read the docs</Link>
      </p>
    </StatusScreen>
  );
}
