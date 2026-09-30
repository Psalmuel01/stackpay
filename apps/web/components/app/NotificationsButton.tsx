"use client";

import Link from "next/link";
import { AlertTriangle, Bell, BellOff, CheckCircle2, Info, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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

type LoadStatus = "loading" | "ready" | "error";

const levelStyles: Record<NotificationItem["level"], { icon: typeof Info; tone: string }> = {
  info: { icon: Info, tone: "border-info/25 bg-info/10 text-info" },
  success: { icon: CheckCircle2, tone: "border-success/25 bg-success/10 text-success" },
  warning: { icon: AlertTriangle, tone: "border-warning/25 bg-warning/10 text-warning" },
  error: { icon: XCircle, tone: "border-danger/25 bg-danger/10 text-danger" },
};

function formatAbsolute(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelative(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "Just now";
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto", style: "short" });
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), "day");
  return formatAbsolute(value);
}

const popoverPosition =
  "fixed inset-x-3 top-[68px] z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]";

export default function NotificationsButton() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [open, setOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  // Items that were unread when the panel opened. Opening marks everything read,
  // so this keeps the unread markers visible for the current viewing.
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const panelId = useId();

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
    // Show or hide the bell when a wallet connects or disconnects elsewhere on the page.
    const sync = () => setWalletAddress(getConnectedWalletAddress());
    window.addEventListener("stackpay:auth", sync);
    return () => window.removeEventListener("stackpay:auth", sync);
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setNotifications([]);
      return;
    }

    let cancelled = false;
    const resolvedWalletAddress = walletAddress;
    if (!hasLoadedRef.current) setStatus("loading");

    async function loadNotifications() {
      try {
        const response = await fetch(
          `/api/notifications?walletAddress=${encodeURIComponent(resolvedWalletAddress)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          if (!hasLoadedRef.current) setStatus("error");
          return;
        }
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
        setStatus("ready");
      } catch {
        // Network error or API not yet available. Only surface it if nothing has loaded yet.
        if (!cancelled && !hasLoadedRef.current) setStatus("error");
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
  }, [walletAddress, reloadKey]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    }
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
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

  function toggle() {
    if (!open) setHighlightedIds(new Set(notifications.filter((item) => !item.read_at).map((item) => item.id)));
    setOpen(!open);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="icon-button relative"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount ? (
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-panel"
          />
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className={`${popoverPosition} flex max-h-[min(560px,calc(100dvh-96px))] flex-col overflow-hidden rounded-card border border-line bg-panel shadow-pop`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
            <h2 className="text-base font-semibold text-fg">Notifications</h2>
            {status === "ready" && notifications.length ? (
              <span className="text-[14px] text-muted">
                {highlightedIds.size ? `${highlightedIds.size} new` : `${notifications.length} recent`}
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {status === "loading" ? (
              <div aria-busy="true" className="divide-y divide-line">
                <span className="sr-only">Loading…</span>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex gap-3 px-4 py-3.5" aria-hidden="true">
                    <span className="skeleton h-8 w-8 shrink-0 rounded-control" />
                    <div className="flex-1 space-y-2 pt-0.5">
                      <span className="skeleton block h-4 w-3/5" />
                      <span className="skeleton block h-3.5 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : status === "error" ? (
              <div className="empty-state px-6 py-10">
                <div className="empty-state-icon">
                  <XCircle size={22} aria-hidden="true" />
                </div>
                <h3>Couldn’t load notifications</h3>
                <p role="alert">Check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="btn btn-secondary btn-sm mt-4"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : notifications.length ? (
              <ul className="divide-y divide-line">
                {notifications.map((item) => {
                  const unread = highlightedIds.has(item.id) || !item.read_at;
                  const { icon: LevelIcon, tone } = levelStyles[item.level] ?? levelStyles.info;
                  const content = (
                    <div
                      className={`relative flex gap-3 px-4 py-3.5 transition-colors ${
                        item.href ? "hover:bg-subtle" : ""
                      } ${unread ? "bg-accent/[0.04]" : ""}`}
                    >
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-control border ${tone}`}>
                        <LevelIcon size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-sm leading-snug ${unread ? "font-semibold text-fg" : "font-medium text-fg-2"}`}>
                            {item.title}
                          </p>
                          <time
                            dateTime={item.created_at}
                            title={formatAbsolute(item.created_at)}
                            className="shrink-0 pt-px text-xs text-faint"
                          >
                            {formatRelative(item.created_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-[14px] leading-relaxed text-muted">{item.body}</p>
                      </div>
                      {unread ? (
                        <>
                          <span aria-hidden="true" className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" />
                          <span className="sr-only">Unread.</span>
                        </>
                      ) : null}
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setOpen(false)}
                          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty-state px-6 py-10">
                <div className="empty-state-icon">
                  <BellOff size={22} aria-hidden="true" />
                </div>
                <h3>You’re all caught up</h3>
                <p>When a customer pays an invoice or payment link, you’ll get a notification here.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {toastNotification ? (
        <div
          role="status"
          className={`${popoverPosition} rounded-card border border-success/30 bg-panel p-4 shadow-pop sm:w-[340px]`}
        >
          <div className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-success/25 bg-success/10 text-success">
              <CheckCircle2 size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-success">New payment</p>
              <p className="mt-0.5 text-sm font-semibold text-fg">{toastNotification.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{toastNotification.body}</p>
              {toastNotification.href ? (
                <Link
                  href={toastNotification.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setToastNotification(null);
                    setOpen(false);
                  }}
                  className="link mt-2 inline-flex text-[14px]"
                >
                  View payment
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
