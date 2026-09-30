import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";

/** Full-page layout for 404 and error screens. */
export default function StatusScreen({
  code,
  title,
  children,
  actions,
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main id="main-content" className="relative flex min-h-screen flex-col overflow-hidden bg-canvas">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
      <header className="relative mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link href="/" aria-label="StackPay home" className="rounded-control"><Logo size={32} /></Link>
      </header>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-24 pt-8 sm:px-6">
        <div className="w-full max-w-lg text-center">
          <p
            aria-hidden="true"
            className="select-none bg-gradient-to-b from-fg/90 to-fg/10 bg-clip-text font-semibold leading-none tracking-[-0.06em] text-transparent"
            style={{ fontSize: "clamp(96px, 22vw, 168px)" }}
          >
            {code}
          </p>
          <h1 className="mt-6 text-3xl font-semibold text-fg sm:text-4xl">{title}</h1>
          <div className="mx-auto mt-4 max-w-md text-base leading-7 text-muted">{children}</div>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
        </div>
      </div>
    </main>
  );
}
