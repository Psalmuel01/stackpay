"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Check, Loader2, Wallet } from "lucide-react";
import TokenLogo from "@/components/TokenLogo";

/* --------------------------------------------------------------------------
   Shared bits
   -------------------------------------------------------------------------- */

const coinStyles = [
  { name: "sBTC" },
  { name: "STX" },
  { name: "USDCx" },
] as const;

type AssetIndex = 0 | 1 | 2;

/** A token logo given coin-like depth: a soft drop shadow and a glassy top highlight. */
function Coin({ asset, size }: { asset: AssetIndex; size: number }) {
  return (
    <span
      className="relative block rounded-full"
      style={{ width: size, height: size, boxShadow: `0 ${size * 0.22}px ${size * 0.45}px rgb(0 0 0 / 0.5)` }}
    >
      <TokenLogo token={coinStyles[asset].name} size={size} />
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: "linear-gradient(160deg, rgb(255 255 255 / 0.28), transparent 45%)",
          boxShadow: `inset 0 -${Math.max(1, size * 0.05)}px 0 rgb(0 0 0 / 0.18), inset 0 0 0 1px rgb(255 255 255 / 0.12)`,
        }}
      />
    </span>
  );
}

/** Pointer position normalised to -1..1, smoothed. Stays at 0 with reduced motion. */
function usePointer() {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  useEffect(() => {
    if (reduce) return;
    const onMove = (event: PointerEvent) => {
      x.set((event.clientX / window.innerWidth) * 2 - 1);
      y.set((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, x, y]);
  return {
    x: useSpring(x, { stiffness: 60, damping: 18 }),
    y: useSpring(y, { stiffness: 60, damping: 18 }),
  };
}

/* --------------------------------------------------------------------------
   Floating coins around the hero
   -------------------------------------------------------------------------- */

const coins: Array<{ asset: AssetIndex; size: number; className: string; depth: number; delay: number; tilt: number }> = [
  { asset: 0, size: 76, className: "left-[4%] top-[18%]", depth: 28, delay: 0, tilt: -14 },
  { asset: 2, size: 54, className: "right-[6%] top-[12%]", depth: 20, delay: 0.8, tilt: 12 },
  { asset: 1, size: 60, className: "right-[11%] top-[46%]", depth: 34, delay: 1.6, tilt: -8 },
  { asset: 2, size: 38, className: "left-[12%] top-[52%] hidden xl:block", depth: 14, delay: 2.2, tilt: 18 },
  { asset: 0, size: 32, className: "right-[24%] top-[4%] hidden xl:block", depth: 10, delay: 1.2, tilt: -20 },
];

function FloatingCoin({ coin, px, py }: { coin: (typeof coins)[number]; px: MotionValue<number>; py: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const x = useTransform(px, v => v * coin.depth);
  const y = useTransform(py, v => v * coin.depth);
  return (
    <motion.div className={`absolute ${coin.className}`} style={{ x, y }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.4, rotate: coin.tilt - 40 }}
        animate={{ opacity: 1, scale: 1, rotate: coin.tilt }}
        transition={{ type: "spring", stiffness: 120, damping: 12, delay: 0.5 + coin.delay * 0.3 }}
      >
        <motion.div
          animate={reduce ? undefined : { y: [0, -14, 0], rotate: [0, 6, 0] }}
          transition={{ duration: 6 + coin.delay, repeat: Infinity, ease: "easeInOut", delay: coin.delay }}
        >
          <Coin asset={coin.asset} size={coin.size} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function HeroCoins() {
  const { x, y } = usePointer();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-[640px] md:block">
      {coins.map((coin, i) => <FloatingCoin key={i} coin={coin} px={x} py={y} />)}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Payment pops: small notifications that surface around the hero
   -------------------------------------------------------------------------- */

const payments: Array<{ amount: string; asset: AssetIndex; from: string }> = [
  { amount: "+250", asset: 2, from: "Northwind Ltd" },
  { amount: "+0.0125", asset: 0, from: "Ada Okafor" },
  { amount: "+120", asset: 1, from: "Workshop ticket" },
  { amount: "+45", asset: 2, from: "Café Mori" },
  { amount: "+0.002", asset: 0, from: "Kiosk 3" },
  { amount: "+880", asset: 1, from: "Pixel Guild" },
  { amount: "+1,200", asset: 2, from: "Retainer · Nov" },
];

const slots = [
  "left-[2%] top-[34%]",
  "right-[2%] top-[28%]",
  "left-[7%] top-[62%]",
  "right-[4%] top-[64%]",
];

export function PaymentPops() {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTick(t => t + 1), 2600);
    return () => window.clearInterval(id);
  }, [reduce]);
  if (reduce) return null;
  const payment = payments[tick % payments.length];
  const slot = slots[tick % slots.length];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-[640px] xl:block">
      <AnimatePresence>
        <motion.div
          key={tick}
          className={`absolute ${slot}`}
          initial={{ opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -24 }}
          transition={{ type: "spring", stiffness: 320, damping: 20 }}
        >
          <div className="flex items-center gap-2.5 rounded-full border border-line-strong bg-panel/95 py-1.5 pl-1.5 pr-4 shadow-pop">
            <Coin asset={payment.asset} size={26} />
            <span className="text-sm font-semibold tabular-nums text-fg">
              {payment.amount} <span className="font-medium text-muted">{coinStyles[payment.asset].name}</span>
            </span>
            <span className="text-sm text-muted">· {payment.from}</span>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-success/15 text-success">
              <Check size={12} strokeWidth={3} />
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Live payments ticker
   -------------------------------------------------------------------------- */

const tickerItems = [
  { amount: "250", asset: 2 as AssetIndex, from: "Northwind Ltd", when: "just now" },
  { amount: "0.0125", asset: 0 as AssetIndex, from: "Lumen Studio", when: "1m ago" },
  { amount: "120", asset: 1 as AssetIndex, from: "Workshop ticket", when: "3m ago" },
  { amount: "45", asset: 2 as AssetIndex, from: "Café Mori", when: "4m ago" },
  { amount: "0.002", asset: 0 as AssetIndex, from: "Kiosk 3", when: "6m ago" },
  { amount: "880", asset: 1 as AssetIndex, from: "Pixel Guild", when: "9m ago" },
  { amount: "1,200", asset: 2 as AssetIndex, from: "Retainer · Nov", when: "12m ago" },
  { amount: "0.05", asset: 0 as AssetIndex, from: "Studio Nine", when: "15m ago" },
];

export function PaymentTicker() {
  const row = tickerItems.map((item, i) => (
    <li key={i} className="flex shrink-0 items-center gap-3 rounded-full border border-line bg-panel py-1.5 pl-1.5 pr-4">
      <Coin asset={item.asset} size={26} />
      <span className="text-sm font-semibold tabular-nums text-fg">
        +{item.amount} <span className="font-medium text-muted">{coinStyles[item.asset].name}</span>
      </span>
      <span className="text-sm text-fg-2">{item.from}</span>
      <span className="text-sm text-muted">{item.when}</span>
    </li>
  ));
  return (
    <div
      aria-hidden="true"
      className="ticker relative overflow-hidden py-5"
      style={{
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
      }}
    >
      <div className="ticker-track flex w-max gap-3">
        <ul className="flex gap-3">{row}</ul>
        <ul className="flex gap-3">{row}</ul>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Checkout story: the hero checkout card plays through a payment
   -------------------------------------------------------------------------- */

type Phase = "idle" | "wallet" | "confirming" | "paid";
const phaseDurations: Record<Phase, number> = { idle: 2200, wallet: 1400, confirming: 1800, paid: 3200 };
const nextPhase: Record<Phase, Phase> = { idle: "wallet", wallet: "confirming", confirming: "paid", paid: "idle" };

export function CheckoutStory({ assetMark }: { assetMark: ReactNode }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  useEffect(() => {
    if (reduce) return;
    const id = window.setTimeout(() => setPhase(nextPhase[phase]), phaseDurations[phase]);
    return () => window.clearTimeout(id);
  }, [phase, reduce]);
  const paid = phase === "paid";

  return (
    <div className="relative mx-auto max-w-[360px] sm:absolute sm:right-0 sm:top-16 sm:w-[320px] lg:top-10 lg:w-[360px]">
      <motion.div
        className="card p-5 shadow-pop ring-1 ring-line-strong sm:p-6"
        animate={paid && !reduce ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-base font-semibold text-accent-text">L</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">Lumen Studio</p>
            <p className="text-xs text-muted">Invoice inv-1043</p>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={paid ? "paid" : "pending"}
              className={`badge ${paid ? "badge-success" : "badge-warning"}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {paid ? "Paid" : "Pending"}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="mt-5 text-sm text-muted">Monthly retainer, October</p>
        <p className="mt-1 flex items-baseline gap-2 text-4xl font-semibold tabular-nums tracking-tight text-fg">
          250 <span className="text-lg font-medium text-muted">USDCx</span>
        </p>
        <dl className="well mt-5 divide-y divide-line text-sm">
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-muted">Pay with</dt>
            <dd className="flex items-center gap-2 font-medium text-fg">{assetMark} USDCx</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-muted">Network</dt>
            <dd className="font-medium text-fg">Stacks testnet</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-muted">Expires</dt>
            <dd className="font-medium text-fg">In 5 days</dd>
          </div>
        </dl>
        <span
          className={`btn btn-lg mt-5 w-full transition-colors duration-300 ${paid ? "border-success/30 bg-success/15 text-success" : "btn-primary"} ${phase === "wallet" ? "scale-[0.98]" : ""}`}
        >
          {phase === "idle" && <><Wallet size={18} /> Pay 250 USDCx</>}
          {phase === "wallet" && <><Wallet size={18} /> Approve in wallet…</>}
          {phase === "confirming" && <><Loader2 size={18} className="animate-spin" /> Confirming on Stacks…</>}
          {phase === "paid" && <><Check size={18} strokeWidth={2.5} /> Payment complete</>}
        </span>
        <p className="mt-3 text-center text-xs text-muted">Confirm in Leather or Xverse</p>
      </motion.div>

      {/* Confirmation toast: pops in when the payment lands (always shown with reduced motion). */}
      <AnimatePresence>
        {(paid || reduce) && (
          <motion.div
            key="toast"
            className="absolute -bottom-12 left-3 flex items-center gap-3 rounded-xl border border-line-strong bg-panel px-4 py-3 shadow-pop sm:-bottom-10 sm:-left-24 lg:-bottom-7 lg:-left-36"
            initial={{ opacity: 0, y: 24, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
              <Check size={16} strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">Payment confirmed</p>
              <p className="text-xs tabular-nums text-muted">250 USDCx · inv-1043</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
