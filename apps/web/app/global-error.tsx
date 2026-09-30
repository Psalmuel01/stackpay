"use client";
import "./globals.css";

// Replaces the root layout when it fails, so it cannot rely on app components.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
          <div className="max-w-md text-center">
            <h1 className="text-3xl font-semibold text-fg">StackPay couldn’t load</h1>
            <p className="mt-4 text-base leading-7 text-muted">An unexpected error stopped the app from starting. Your funds and on-chain records aren’t affected.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" onClick={reset} className="btn btn-primary btn-lg">Try again</button>
              <a href="/" className="btn btn-secondary btn-lg">Back to home</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
