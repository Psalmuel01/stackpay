"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Delete, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import QrPreview from "@/components/app/QrPreview";
import TokenLogo from "@/components/TokenLogo";
import { currencyDecimals, decimalToAtomic, type PaymentCurrency } from "@/lib/amounts";
import { formatCurrencyAmount } from "@/lib/format";

/**
 * Counter Mode: a point-of-sale screen for the merchant's Universal QR. The cashier enters an amount,
 * the customer scans a QR prefilled with it, and confirmed payments appear live with an optional chime.
 */

type UniversalLink = { slug: string; title: string; is_active: boolean; onchain_link_id?: string | null };
type FeedItem = { id: string; amount: string; currency: PaymentCurrency; paid_at: string; description: string };
const CURRENCIES: PaymentCurrency[] = ["USDCx", "STX", "sBTC"];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

function chime() {
  try {
    const context = new AudioContext();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + index * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.15 + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.15);
      oscillator.stop(context.currentTime + index * 0.15 + 0.32);
    });
  } catch {
    // Audio is optional.
  }
}

export default function CounterModePage() {
  const [link, setLink] = useState<UniversalLink | null | undefined>(undefined);
  const [origin, setOrigin] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<PaymentCurrency>("USDCx");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [latest, setLatest] = useState<FeedItem | null>(null);
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/qr-link", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setLink((payload?.data as UniversalLink | null) ?? null))
      .catch(() => setLink(null));
  }, []);

  const poll = useCallback(async () => {
    const response = await fetch("/api/counter/feed", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const items = ((await response.json()).data ?? []) as FeedItem[];
    setFeed(items);
    if (seen.current === null) {
      seen.current = new Set(items.map((item) => item.id)); // existing payments are not announced
      return;
    }
    const fresh = items.filter((item) => !seen.current!.has(item.id));
    fresh.forEach((item) => seen.current!.add(item.id));
    if (fresh.length) {
      setLatest(fresh[0]);
      if (sound) chime();
    }
  }, [sound]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(poll, 4000);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!latest) return;
    const timer = window.setTimeout(() => setLatest(null), 8000);
    return () => window.clearTimeout(timer);
  }, [latest]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const validAmount = useMemo(() => {
    try {
      return amount !== "" && decimalToAtomic(amount, currency) > 0n;
    } catch {
      return false;
    }
  }, [amount, currency]);

  const qrValue = link?.slug && origin
    ? `${origin}/pay/link/${link.slug}${validAmount ? `?amount=${encodeURIComponent(amount)}&currency=${currency}` : ""}`
    : null;

  function press(key: string) {
    setAmount((current) => {
      if (key === "del") return current.slice(0, -1);
      if (key === "." && current.includes(".")) return current;
      const next = current === "" && key === "." ? "0." : current + key;
      const decimals = next.split(".")[1]?.length ?? 0;
      return decimals > currencyDecimals[currency] || next.length > 16 ? current : next;
    });
  }

  if (link === undefined) {
    return <div className="mx-auto max-w-3xl space-y-4" aria-busy="true"><div className="skeleton h-10 w-56" /><div className="skeleton h-96" /></div>;
  }

  if (!link || !link.onchain_link_id || !link.is_active) {
    return (
      <section className="card mx-auto max-w-xl">
        <div className="empty-state">
          <h3>Set up Universal QR first</h3>
          <p>Counter Mode uses your permanent Universal QR link. Create it once, then come back to take payments at the counter.</p>
          <Link href="/qr-link" className="btn btn-primary mt-5">Set up Universal QR</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/qr-link" className="btn btn-ghost btn-icon" aria-label="Back to Universal QR"><ArrowLeft size={18} /></Link>
          <div>
            <h1 className="text-2xl font-semibold text-fg">Counter Mode</h1>
            <p className="text-sm text-muted">Enter the amount, let the customer scan, and watch it confirm.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSound((value) => !value); if (!sound) chime(); }} aria-pressed={sound}>
            {sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
            {fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </div>

      {latest && (
        <div role="status" aria-live="assertive" className="alert alert-success items-center text-base">
          <CheckCircle2 size={28} className="shrink-0" aria-hidden="true" />
          <div>
            <strong className="block text-xl">Paid {formatCurrencyAmount(latest.amount, latest.currency)}</strong>
            <span className="text-fg-2">Confirmed on Stacks{latest.description ? ` · ${latest.description}` : ""}</span>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card p-5 sm:p-6" aria-label="Amount">
          <div className="segmented w-full" role="group" aria-label="Currency">
            {CURRENCIES.map((code) => (
              <button key={code} type="button" className="flex-1" aria-pressed={currency === code} onClick={() => { setCurrency(code); setAmount(""); }}>
                <TokenLogo token={code} size={18} />{code}
              </button>
            ))}
          </div>
          <output className="mt-6 block text-center font-semibold tabular-nums tracking-tight text-fg" style={{ fontSize: "clamp(40px, 8vw, 72px)" }} aria-live="polite">
            {amount || "0"} <span className="text-2xl font-medium text-muted">{currency}</span>
          </output>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button key={key} type="button" onClick={() => press(key)} className="btn btn-secondary btn-lg h-16 text-2xl" aria-label={key === "del" ? "Delete last digit" : key === "." ? "Decimal point" : key}>
                {key === "del" ? <Delete size={22} aria-hidden="true" /> : key}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => setAmount("")}>Clear amount</button>
        </section>

        <section className="card flex flex-col items-center justify-center p-5 text-center sm:p-6" aria-label="Scan to pay">
          <p className="eyebrow">{validAmount ? "Scan to pay" : "Scan to pay any amount"}</p>
          <p className="mt-2 text-xl font-semibold text-fg">{validAmount ? formatCurrencyAmount(amount, currency) : link.title}</p>
          <div className="mt-4 w-full max-w-[340px]">
            <QrPreview value={qrValue} label="" caption="" size={320} />
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted">The customer scans with their phone, connects Leather or Xverse, and approves. The payment appears here once Stacks confirms it.</p>
        </section>
      </div>

      <section className="card overflow-hidden" aria-labelledby="recent-title">
        <div className="card-header"><h2 id="recent-title" className="card-title">Recent payments</h2></div>
        {feed.length === 0 ? (
          <p className="p-5 text-sm text-muted sm:p-6">Confirmed payments appear here automatically.</p>
        ) : (
          <ul className="divide-y divide-line">
            {feed.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <TokenLogo token={item.currency} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums text-fg">{formatCurrencyAmount(item.amount, item.currency)}</p>
                  {item.description ? <p className="truncate text-sm text-muted">{item.description}</p> : null}
                </div>
                <time className="text-sm text-muted" dateTime={item.paid_at}>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(item.paid_at))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
