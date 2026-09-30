"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import StatusScreen from "@/components/StatusScreen";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusScreen
      code="500"
      title="Something went wrong"
      actions={<>
        <button type="button" onClick={reset} className="btn btn-primary btn-lg"><RotateCcw size={18} aria-hidden="true" />Try again</button>
        <Link href="/" className="btn btn-secondary btn-lg"><ArrowLeft size={18} aria-hidden="true" />Back to home</Link>
      </>}
    >
      <p>This page hit an unexpected error. Your funds and on-chain records aren’t affected. Try again, or come back in a moment.</p>
      {error.digest && <p className="mt-4 font-mono text-xs text-faint">Reference: {error.digest}</p>}
    </StatusScreen>
  );
}
