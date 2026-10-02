"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, Delete, Loader2, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import QrPreview from "@/components/app/QrPreview";
import TokenLogo from "@/components/TokenLogo";
import { currencyDecimals, decimalToAtomic, type PaymentCurrency } from "@/lib/amounts";
import { formatCurrencyAmount } from "@/lib/format";

/**
 * Counter Mode: a point-of-sale screen. The cashier enters an amount and presses Charge, which creates
 * a fixed-amount invoice for this sale. The customer scans its checkout and cannot change the amount:
 * the on-chain invoice must match it and the contract only accepts exactly that payment. The screen
 * watches that one invoice and confirms when it is paid.
 */

type UniversalLink = { slug: string; title: string; is_active: boolean; onchain_link_id?: string | null };
type FeedItem = { id: string; amount: string; currency: PaymentCurrency; paid_at: string; description: string };
type Charge = { id: string; amount: string; currency: PaymentCurrency; checkout_url: string; expires_at: string };
type SaleState = "idle" | "creating" | "waiting" | "paid" | "expired";
const STATUS_POLL_MS = 3000;
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
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<PaymentCurrency>("USDCx");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [sale, setSale] = useState<SaleState>("idle");
  const [saleError, setSaleError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    fetch("/api/qr-link", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setLink((payload?.data as UniversalLink | null) ?? null))
      .catch(() => setLink(null));
  }, []);

  const poll = useCallback(async () => {
    const response = await fetch("/api/counter/feed", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    setFeed(((await response.json()).data ?? []) as FeedItem[]);
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => window.clearInterval(timer);
  }, [poll]);

  // Watch the current sale's invoice until it is paid or expires.
  useEffect(() => {
    if (!charge || sale !== "waiting") return;
    let cancelled = false;
    const check = async () => {
      setNowMs(Date.now());
      if (Date.parse(charge.expires_at) <= Date.now()) {
        setSale("expired");
        return;
      }
      const response = await fetch(`/api/invoices/${encodeURIComponent(charge.id)}`, { cache: "no-store" }).catch(() => null);
      if (cancelled || !response?.ok) return;
      const status = (await response.json())?.data?.status as string | undefined;
      if (status === "paid") {
        setSale("paid");
        if (soundRef.current) chime();
        void poll();
      } else if (status === "expired" || status === "canceled") {
        setSale("expired");
      }
    };
    void check();
    const timer = window.setInterval(check, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [charge, sale, poll]);

  async function startCharge() {
    setSaleError(null);
    setSale("creating");
    try {
      const response = await fetch("/api/counter/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not start the sale.");
      setCharge(payload.data as Charge);
      setSale("waiting");
    } catch (error) {
      setSale("idle");
      setSaleError(error instanceof Error ? error.message : "Could not start the sale.");
    }
  }

  function newSale() {
    setCharge(null);
    setSale("idle");
    setSaleError(null);
    setAmount("");
  }

  // On phones the QR sits below the keypad: bring it into view when a sale starts or finishes.
  useEffect(() => {
    if (sale === "waiting" || sale === "paid" || sale === "expired") {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [sale]);

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

  const locked = sale !== "idle";
  const secondsLeft = charge ? Math.max(0, Math.round((Date.parse(charge.expires_at) - nowMs) / 1000)) : 0;

  function press(key: string) {
    if (locked) return;
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
            <p className="text-sm text-muted">Enter the amount, press Charge, and let the customer scan. The amount can’t be changed on their phone.</p>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card p-5 sm:p-6" aria-label="Amount">
          <div className="segmented w-full" role="group" aria-label="Currency">
            {CURRENCIES.map((code) => (
              <button key={code} type="button" className="flex-1" disabled={locked} aria-pressed={currency === code} onClick={() => { setCurrency(code); setAmount(""); }}>
                <TokenLogo token={code} size={18} />{code}
              </button>
            ))}
          </div>
          <output className="mt-6 block text-center font-semibold tabular-nums tracking-tight text-fg" style={{ fontSize: "clamp(40px, 8vw, 72px)" }} aria-live="polite">
            {amount || "0"} <span className="text-2xl font-medium text-muted">{currency}</span>
          </output>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button key={key} type="button" disabled={locked} onClick={() => press(key)} className="btn btn-secondary btn-lg h-16 text-2xl" aria-label={key === "del" ? "Delete last digit" : key === "." ? "Decimal point" : key}>
                {key === "del" ? <Delete size={22} aria-hidden="true" /> : key}
              </button>
            ))}
          </div>
          {locked ? (
            <button type="button" className="btn btn-secondary btn-lg mt-3 w-full" onClick={newSale} disabled={sale === "creating"}>
              {sale === "paid" ? "New sale" : "Cancel sale"}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-lg mt-3 w-full" disabled={!validAmount} onClick={() => void startCharge()}>
                {validAmount ? `Charge ${formatCurrencyAmount(amount, currency)}` : "Enter an amount"}
              </button>
              <button type="button" className="btn btn-ghost mt-2 w-full" onClick={() => setAmount("")}>Clear amount</button>
            </>
          )}
          {saleError ? <p role="alert" className="mt-3 text-sm text-danger">{saleError}</p> : null}
        </section>

        <section ref={panelRef} className="card flex scroll-mt-24 flex-col items-center justify-center p-5 text-center sm:p-6" aria-label="Scan to pay" aria-live="polite">
          {sale === "paid" && charge ? (
            <div role="status" className="flex flex-col items-center py-6">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-success/10 text-success" aria-hidden="true">
                <CheckCircle2 size={44} />
              </span>
              <p className="mt-5 text-3xl font-semibold text-fg">Paid {formatCurrencyAmount(charge.amount, charge.currency)}</p>
              <p className="mt-2 text-muted">Confirmed on Stacks. You can hand over the order.</p>
              <button type="button" className="btn btn-primary btn-lg mt-6" onClick={newSale}>New sale</button>
            </div>
          ) : sale === "expired" && charge ? (
            <div role="status" className="flex flex-col items-center py-6">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-line-strong bg-panel text-muted" aria-hidden="true">
                <Clock3 size={30} />
              </span>
              <p className="mt-5 text-xl font-semibold text-fg">This sale expired unpaid</p>
              <p className="mt-2 text-sm text-muted">Start a new sale to show a fresh code.</p>
              <button type="button" className="btn btn-primary mt-6" onClick={newSale}>New sale</button>
            </div>
          ) : charge ? (
            <>
              <p className="eyebrow">Scan to pay</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-fg">{formatCurrencyAmount(charge.amount, charge.currency)}</p>
              <div className="mt-4 w-full max-w-[340px]">
                <QrPreview value={charge.checkout_url} label="" caption="" size={320} />
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-fg-2">
                <Loader2 size={16} className="animate-spin text-accent-text" aria-hidden="true" />
                Waiting for payment · expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted">The customer approves twice in their wallet: once to open this exact invoice, once to pay it. Hand over the order only when this screen says Paid.</p>
            </>
          ) : (
            <div className="flex flex-col items-center py-10">
              <p className="eyebrow">{sale === "creating" ? "Preparing" : "Ready"}</p>
              <p className="mt-2 text-xl font-semibold text-fg">{sale === "creating" ? "Creating the sale…" : "Enter an amount and press Charge"}</p>
              <p className="mt-2 max-w-sm text-sm text-muted">Each sale gets its own QR code for exactly that amount.</p>
            </div>
          )}
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
