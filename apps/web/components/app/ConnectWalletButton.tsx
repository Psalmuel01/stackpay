"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Copy, Landmark, LogOut, MonitorX, Wallet } from "lucide-react";
import { connectWallet, disconnectWallet, getConnectedWalletAddress, walletErrorMessage } from "@/lib/wallet-connection";
import { formatDecimalAmount } from "@/lib/amounts";

/** Exact decimal strings; null means the balance could not be read. */
type WalletBalances = {
  STX: string | null;
  sBTC: string | null;
  USDCx: string | null;
};

type MerchantProfile = {
  company_name?: string;
  display_name?: string;
  settlement_wallet?: string | null;
};

function truncateAddress(address: string, start = 6, end = 4) {
  return `${address.slice(0, start)}…${address.slice(-end)}`;
}

function formatBalance(amount: string | null, symbol: "STX" | "sBTC" | "USDCx") {
  if (amount === null) {
    return "Unavailable";
  }

  return `${formatDecimalAmount(amount, symbol)} ${symbol}`;
}

const menuItem =
  "flex min-h-[42px] w-full items-center gap-3 rounded-control px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

/**
 * `header` is the compact top-bar control. `inline` is a full-width primary
 * action for use inside page content (for example the sign-in card).
 */
export default function ConnectWalletButton({ variant = "header" }: { variant?: "header" | "inline" }) {
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.contains(document.activeElement)) {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    setConnected(Boolean(getConnectedWalletAddress()));
    setAddress(getConnectedWalletAddress());
    // Keep every instance (top bar, sign-in card) in step when the wallet changes elsewhere.
    const sync = () => {
      const next = getConnectedWalletAddress();
      setConnected(Boolean(next));
      setAddress(next);
    };
    window.addEventListener("stackpay:auth", sync);
    return () => window.removeEventListener("stackpay:auth", sync);
  }, []);

  useEffect(() => {
    setAddress(getConnectedWalletAddress());
  }, [connected]);

  useEffect(() => {
    if (!address) {
      setBalances(null);
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoadingBalances(true);

    Promise.all([
      fetch(`/api/wallet/balances?address=${encodeURIComponent(address)}`, { cache: "no-store" }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Failed to load wallet balances.");
        }
        return (payload.data ?? null) as WalletBalances | null;
      }),
      fetch(`/api/merchant/profile?walletAddress=${encodeURIComponent(address)}`, { cache: "no-store" }).then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const payload = await response.json();
        return (payload.data ?? null) as MerchantProfile | null;
      }),
    ])
      .then(([nextBalances, nextProfile]) => {
        if (!cancelled) {
          setBalances(nextBalances);
          setProfile(nextProfile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBalances({ STX: null, sBTC: null, USDCx: null });
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBalances(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const nextAddress = await connectWallet();
      setAddress(nextAddress);
      setConnected(true);
    } catch (error) {
      setConnected(false);
      setAddress(null);
      setConnectionError(walletErrorMessage(error));
    } finally { setConnecting(false); }
  };

  const handleDisconnect = async (scope: "this" | "all" = "this") => {
    setConnectionError(null);
    try {
      const response = await fetch(scope === "all" ? "/api/auth/session?scope=all" : "/api/auth/session", { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message ?? "Could not sign out securely. Please try again.");
      }
      disconnectWallet();
      setConnected(false);
      setAddress(null);
      setBalances(null);
      setProfile(null);
      setOpen(false);
    } catch (error) { setConnectionError(walletErrorMessage(error)); }
  };

  async function handleCopy() {
    if (!address) {
      return;
    }
    await navigator.clipboard.writeText(address);
    setOpen(false);
  }

  if (!connected || !address) {
    if (variant === "inline") {
      return (
        <div className="w-full">
          <button
            type="button"
            disabled={connecting}
            onClick={handleConnect}
            className="btn btn-primary btn-lg w-full"
          >
            <Wallet size={18} aria-hidden="true" />
            {connecting ? "Waiting for your wallet…" : "Connect wallet"}
          </button>
          {connectionError && (
            <p role="alert" className="alert alert-danger mt-3">
              {connectionError}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          type="button"
          disabled={connecting}
          onClick={handleConnect}
          className="btn btn-primary min-h-[40px] px-3.5 sm:px-4"
        >
          <Wallet size={16} aria-hidden="true" />
          {connecting ? (
            "Connecting…"
          ) : (
            <>
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect wallet</span>
            </>
          )}
        </button>
        {connectionError && (
          <p
            role="alert"
            className="alert alert-danger absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-32px))] shadow-pop"
          >
            {connectionError}
          </p>
        )}
      </div>
    );
  }

  const balanceRows: Array<["STX" | "sBTC" | "USDCx", string | null]> = [
    ["sBTC", balances?.sBTC ?? null],
    ["STX", balances?.STX ?? null],
    ["USDCx", balances?.USDCx ?? null],
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Connected wallet options"
        title={address}
        onClick={() => setOpen((value) => !value)}
        className="btn btn-secondary min-h-[40px] gap-2 px-3 font-medium sm:px-3.5"
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-success" />
        <span className="font-mono text-[13.5px] tabular-nums sm:hidden">{truncateAddress(address, 2, 4)}</span>
        <span className="hidden font-mono text-[13.5px] tabular-nums sm:inline">{truncateAddress(address)}</span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`hidden text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`}
        />
      </button>
      {connectionError && !open && (
        <p
          role="alert"
          className="alert alert-danger absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-32px))] shadow-pop"
        >
          {connectionError}
        </p>
      )}
      {open ? (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-card border border-line bg-panel shadow-pop"
        >
          <div className="flex items-start gap-3 border-b border-line p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-line bg-subtle text-fg-2">
              <Wallet size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                {profile?.company_name || profile?.display_name || "Connected wallet"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="font-mono">{truncateAddress(address, 8, 6)}</span>
              </p>
            </div>
          </div>

          <div className="border-b border-line px-4 py-3" aria-busy={loadingBalances}>
            <p className="mb-1.5 text-[14px] font-medium text-muted">Wallet balance</p>
            <dl className="space-y-1">
              {balanceRows.map(([symbol, amount]) => (
                <div key={symbol} className="flex min-h-[28px] items-center justify-between gap-3 text-sm">
                  <dt className="text-fg-2">{symbol}</dt>
                  <dd className="font-medium tabular-nums text-fg">
                    {loadingBalances ? (
                      <>
                        <span className="skeleton block h-4 w-20" aria-hidden="true" />
                        <span className="sr-only">Loading…</span>
                      </>
                    ) : amount === null ? (
                      <span className="font-normal text-muted">{formatBalance(amount, symbol)}</span>
                    ) : (
                      formatBalance(amount, symbol)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {profile?.settlement_wallet ? (
              <p className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5 text-[14px] text-muted">
                <Landmark size={15} aria-hidden="true" className="shrink-0" />
                <span>
                  Settles to <span className="font-mono text-fg-2">{truncateAddress(profile.settlement_wallet)}</span>
                </span>
              </p>
            ) : null}
          </div>

          <div className="p-1.5">
            <button type="button" onClick={handleCopy} className={`${menuItem} text-fg-2 hover:bg-subtle hover:text-fg`}>
              <Copy size={17} aria-hidden="true" className="text-muted" />
              Copy address
            </button>
            <button type="button" onClick={() => handleDisconnect("all")} className={`${menuItem} text-fg-2 hover:bg-subtle hover:text-fg`}>
              <MonitorX size={17} aria-hidden="true" className="text-muted" />
              Sign out of all devices
            </button>
            <button type="button" onClick={() => handleDisconnect()} className={`${menuItem} text-danger hover:bg-danger/10`}>
              <LogOut size={17} aria-hidden="true" />
              Sign out and disconnect
            </button>
          </div>
          {connectionError && (
            <p role="alert" className="alert alert-danger mx-3 mb-3">
              {connectionError}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
