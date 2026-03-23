"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getConnectedWalletAddress } from "@/lib/stacks";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  level: "info" | "success" | "warning" | "error";
  read_at?: string | null;
  created_at: string;
};

export default function NotificationsButton() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  function pingNotification() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const audioContext = new window.AudioContext();
      void audioContext.resume().catch(() => {});

      const scheduleNote = (frequency: number, startOffset: number, duration: number, volume: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime + startOffset);
        gainNode.gain.exponentialRampToValueAtTime(volume, audioContext.currentTime + startOffset + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + startOffset + duration);
        oscillator.start(audioContext.currentTime + startOffset);
        oscillator.stop(audioContext.currentTime + startOffset + duration + 0.02);
      };

      scheduleNote(740, 0, 0.14, 0.12);
      scheduleNote(988, 0.12, 0.16, 0.14);
      scheduleNote(1175, 0.28, 0.22, 0.12);

      window.setTimeout(() => {
        void audioContext.close().catch(() => {});
      }, 700);

      if ("vibrate" in navigator) {
        navigator.vibrate?.([40, 20, 40]);
      }
    } catch {
      // ignore autoplay/audio context issues
    }
  }

  useEffect(() => {
    setWalletAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setNotifications([]);
      return;
    }

    let cancelled = false;
    const resolvedWalletAddress = walletAddress;

    async function loadNotifications() {
      try {
        const response = await fetch(
          `/api/notifications?walletAddress=${encodeURIComponent(resolvedWalletAddress)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        const nextNotifications = (payload.data ?? []) as NotificationItem[];

        if (!hasLoadedRef.current) {
          seenIdsRef.current = new Set(nextNotifications.map((item) => item.id));
          hasLoadedRef.current = true;
        } else {
          const nextUnread = nextNotifications.find(
            (item) => !item.read_at && !seenIdsRef.current.has(item.id)
          );

          if (nextUnread) {
            setToastNotification(nextUnread);
            pingNotification();
            window.setTimeout(() => {
              setToastNotification((current) => (current?.id === nextUnread.id ? null : current));
            }, 5000);
          }

          seenIdsRef.current = new Set(nextNotifications.map((item) => item.id));
        }

        setNotifications(nextNotifications);
      } catch {
        // silently ignore — network error or API not yet available
      }
    }

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [walletAddress]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
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

  useEffect(() => {
    if (!open || !walletAddress) {
      return;
    }

    const resolvedWalletAddress = walletAddress;

    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: resolvedWalletAddress }),
    })
      .then(() => {
        setNotifications((current) =>
          current.map((item) => ({
            ...item,
            read_at: item.read_at ?? new Date().toISOString(),
          }))
        );
      })
      .catch(() => { });
  }, [open, walletAddress]);

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  if (!walletAddress) {
    return null;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 transition hover:border-white/20 hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1 text-[10px] font-semibold text-black">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+12px)] w-96 rounded-3xl border border-white/10 bg-[#0a0a0a]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="mb-2 flex items-center justify-between px-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Notifications</div>
            <span className="text-xs text-white/40">{notifications.length} recent</span>
          </div>
          <div className="space-y-2">
            {notifications.length ? (
              notifications.map((item) => {
                const content = (
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm transition mb-2 ${item.read_at
                        ? "bg-white/5 text-white/70"
                        : "bg-white/10 text-white"
                      }`}
                  >
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-sm text-white/55">{item.body}</div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-white/30">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(item.created_at))}
                    </div>
                  </div>
                );

                return item.href ? (
                  <Link key={item.id} href={item.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })
            ) : (
              <div className="rounded-2xl bg-white/5 px-3 py-4 text-sm text-white/55">
                No notifications yet. Invoice-paid events will show up here once the Chainhook webhook starts posting.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {toastNotification ? (
        <div className="absolute left-0 top-[calc(100%+12px)] w-80 rounded-3xl border border-emerald-300/30 bg-[#07110c]/95 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">New payment</div>
          <div className="mt-2 text-sm font-medium">{toastNotification.title}</div>
          <div className="mt-1 text-sm text-white/65">{toastNotification.body}</div>
          {toastNotification.href ? (
            <Link
              href={toastNotification.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                setToastNotification(null);
                setOpen(false);
              }}
              className="mt-3 inline-flex text-xs text-emerald-300 underline underline-offset-4"
            >
              Open
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
