"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import ConnectWalletButton from "@/components/app/ConnectWalletButton";
import NotificationsButton from "@/components/app/NotificationsButton";
import { appNavigation, settingsNavigation } from "@stackpay/ui";

export default function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasSettingsItems = settingsNavigation.length > 0;
  const settingsActive = open || settingsNavigation.some((item) => pathname?.startsWith(item.href));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-black/30 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="StackPay home">
          <Logo size={40} />
        </Link>

        <nav className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 text-[13px] text-white/70 xl:flex">
          {appNavigation.map((item) => {
            const active = !settingsActive && pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 transition ${
                  active ? "pill-active text-white" : "hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {hasSettingsItems ? (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setOpen((value) => !value)}
                className={`rounded-full px-4 py-2 transition ${
                  settingsActive
                    ? "pill-active text-white"
                    : "hover:text-white"
                }`}
              >
                Settings
              </button>
              {open ? (
                <div className="absolute right-0 top-[calc(100%+12px)] w-56 rounded-3xl border border-white/10 bg-[#0a0a0a]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
                  <div className="mb-2 px-3 text-[11px] uppercase tracking-[0.24em] text-white/35">
                    Merchant controls
                  </div>
                  <div className="space-y-1">
                    {settingsNavigation.map((item) => {
                      const active = pathname?.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`block rounded-2xl px-3 py-3 text-sm transition ${
                            active
                              ? "bg-white text-black"
                              : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className="flex items-center gap-3">
          <NotificationsButton />
          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}
