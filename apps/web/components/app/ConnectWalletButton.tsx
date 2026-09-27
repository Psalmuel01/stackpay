"use client";

import { useEffect, useRef, useState } from "react";
import { showConnect } from "@stacks/connect";
import { getAppDetails, getConnectedWalletAddress, userSession } from "@/lib/stacks";

type WalletBalances = {
  STX: number | null;
  sBTC: number | null;
  USDCx: number | null;
};

type MerchantProfile = {
  company_name?: string;
  display_name?: string;
  settlement_wallet?: string | null;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatBalance(amount: number | null, symbol: "STX" | "sBTC" | "USDCx") {
  if (amount === null) {
    return "Unavailable";
  }

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: symbol === "sBTC" ? 8 : 2,
  }).format(amount)} ${symbol}`;
}

export default function ConnectWalletButton() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setConnected(userSession.isUserSignedIn());
    setAddress(getConnectedWalletAddress());
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

  const handleConnect = () => {
    showConnect({
      appDetails: getAppDetails(),
      userSession,
      onFinish: () => {
        setConnected(true);
        setAddress(getConnectedWalletAddress());
        window.dispatchEvent(new Event("stackpay:auth"));
      },
    });
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/auth/session", { method: "DELETE" });
    if (!response.ok) { window.alert("Could not sign out securely. Please try again."); return; }
    userSession.signUserOut();
    window.dispatchEvent(new Event("stackpay:auth"));
    setConnected(false);
    setAddress(null);
    setBalances(null);
    setProfile(null);
    setOpen(false);
  };

  async function handleCopy() {
    if (!address) {
      return;
    }
    await navigator.clipboard.writeText(address);
    setOpen(false);
  }

  if (!connected || !address) {
    return (
      <button
        onClick={handleConnect}
        className="button-glow rounded-full border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02]"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:text-white"
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" />
        <span>{truncateAddress(address)}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] w-80 rounded-3xl border border-white/10 bg-[#0a0a0a]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="rounded-2xl bg-white/5 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Connected wallet</div>
            <div className="mt-2 font-mono text-xs text-white/75">{truncateAddress(address)}</div>
            {profile?.settlement_wallet ? (
              <div className="mt-3 text-xs text-white/45">
                Settlement wallet: {truncateAddress(profile.settlement_wallet)}
              </div>
            ) : null}
          </div>

          <div className="mt-3 rounded-2xl bg-white/5 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Wallet balances</div>
            <div className="mt-3 space-y-2 text-sm text-white/75">
              <div className="flex items-center justify-between">
                <span>STX</span>
                <span>{loadingBalances ? "Loading..." : formatBalance(balances?.STX ?? null, "STX")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>sBTC</span>
                <span>{loadingBalances ? "Loading..." : formatBalance(balances?.sBTC ?? null, "sBTC")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>USDCx</span>
                <span>{loadingBalances ? "Loading..." : formatBalance(balances?.USDCx ?? null, "USDCx")}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Copy
            </button>
            <button
              onClick={handleDisconnect}
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
