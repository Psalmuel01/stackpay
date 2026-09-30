"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Link2,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  UserRound,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import QrPreview from "@/components/app/QrPreview";
import { getConnectedWalletAddress, submitContractIntent, type StackPayContractIntent } from "@/lib/stacks";

type MerchantProfile = {
  company_name?: string;
  display_name?: string;
  email?: string;
  slug?: string;
  settlement_wallet?: string | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type UniversalQrLink = {
  id: string;
  slug: string;
  title: string;
  description: string;
  is_active: boolean;
  onchain_link_id?: string | null;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function QrLinkPage() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [universalLink, setUniversalLink] = useState<UniversalQrLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setMerchantProfile(null);
      setUniversalLink(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/merchant/profile?walletAddress=${encodeURIComponent(connectedAddress)}`).then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const payload = await response.json();
        return (payload.data ?? null) as MerchantProfile | null;
      }),
      fetch(`/api/qr-link?walletAddress=${encodeURIComponent(connectedAddress)}`).then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const payload = await response.json();
        return (payload.data ?? null) as UniversalQrLink | null;
      }),
    ])
      .then(([merchant, qrLink]) => {
        if (!cancelled) {
          setMerchantProfile(merchant);
          setUniversalLink(qrLink);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMerchantProfile(null);
          setUniversalLink(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  const merchantName = (merchantProfile?.company_name || merchantProfile?.display_name || "").trim();
  const settlementWallet = merchantProfile?.settlement_wallet || connectedAddress || "";
  const ready = Boolean(
    connectedAddress &&
    (merchantProfile?.company_name ?? "").trim().length > 6 &&
    (merchantProfile?.display_name ?? "").trim() &&
    isValidEmail((merchantProfile?.email ?? "").trim())
  );
  const hostedHref = universalLink ? `/pay/link/${universalLink.slug}` : "";
  const hostedUrl = hostedHref && origin ? `${origin}${hostedHref}` : "";

  function saveFile(href: string, filename: string) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function handleDownload(format: "png" | "svg") {
    if (!hostedUrl || !universalLink) {
      return;
    }

    setDownloadError(null);
    const filename = `stackpay-qr-${universalLink.slug}.${format}`;
    const options = { margin: 2, errorCorrectionLevel: "M" as const, color: { dark: "#000000", light: "#ffffff" } };

    try {
      if (format === "png") {
        saveFile(await QRCode.toDataURL(hostedUrl, { ...options, width: 1024 }), filename);
        return;
      }

      const markup = await QRCode.toString(hostedUrl, { ...options, type: "svg" });
      const objectUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      saveFile(objectUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError("Couldn’t create the download. Try again.");
    }
  }

  async function confirmPaymentLinkFromChain(paymentLinkId: string, txId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`/api/payment-links/${paymentLinkId}/chain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to confirm QR transaction.");
      }

      if (payload.data?.onchain_link_id) {
        return payload.data as UniversalQrLink;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }

    return null;
  }

  async function handleCopy() {
    if (!hostedHref) {
      return;
    }

    await navigator.clipboard.writeText(`${window.location.origin}${hostedHref}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleGenerate(rotate = false) {
    if (!connectedAddress) {
      setError("Connect a wallet before generating a QR link.");
      return;
    }

    if (!ready) {
      setError("Complete your merchant profile first so the QR route uses your real business identity.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/qr-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          rotate,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to generate QR link.");
      }
      const paymentLink = payload.data.paymentLink as UniversalQrLink;
      const contractIntent = payload.data.contractIntent as StackPayContractIntent | null;

      if (!contractIntent) {
        setUniversalLink(paymentLink);
        setSubmitting(false);
        return;
      }

      await submitContractIntent(contractIntent, {
        onCancel: () => {
          setError("Contract call was canceled.");
          setSubmitting(false);
        },
        onFinish: async ({ txId }) => {
          try {
            const chainLink = await confirmPaymentLinkFromChain(paymentLink.id, txId);
            setUniversalLink(chainLink ?? paymentLink);
          } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : "Failed to confirm QR link.");
          } finally {
            setSubmitting(false);
          }
        },
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to generate QR link.");
      setSubmitting(false);
    }
  }

  const isLive = Boolean(universalLink?.onchain_link_id);
  const statusBadge = universalLink
    ? isLive
      ? universalLink.is_active
        ? { label: "Live", tone: "badge-success" }
        : { label: "Inactive", tone: "badge-neutral" }
      : { label: "Pending", tone: "badge-warning" }
    : null;

  const header = (
    <PageHeader
      title="Universal QR"
      subtitle="One permanent QR code for your counter, table, or storefront. Customers scan it, pick sBTC, STX, or USDCx, and enter the amount themselves."
    />
  );

  const errorAlert = error ? (
    <div className="alert alert-danger" role="alert">
      {error}
    </div>
  ) : null;

  if (!connectedAddress) {
    return (
      <div>
        {header}
        <section className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <Wallet size={22} />
            </span>
            <h3>Connect a wallet to continue</h3>
            <p>StackPay needs your merchant wallet to load your QR code or set up a new one.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loading && !universalLink) {
    return (
      <div>
        {header}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true">
          <span className="sr-only">Loading…</span>
          <section className="card p-5 sm:p-6">
            <div className="skeleton h-5 w-48" />
            <div className="skeleton mt-3 h-4 w-72 max-w-full" />
            <div className="skeleton mx-auto mt-8 aspect-square w-[244px] max-w-full rounded-xl" />
            <div className="skeleton mx-auto mt-6 h-11 w-full max-w-md" />
          </section>
          <section className="card p-5 sm:p-6">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton mt-5 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-5/6" />
            <div className="skeleton mt-3 h-4 w-2/3" />
          </section>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div>
        {header}
        <section className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <UserRound size={22} />
            </span>
            <h3>Finish your merchant profile first</h3>
            <p>
              Your QR checkout shows your business name to customers. Add your business name, display name, and email
              in Profile, then come back to set up your code.
            </p>
            <Link href="/profile" className="btn btn-primary mt-5">
              Complete profile
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!universalLink) {
    const steps = [
      {
        icon: QrCode,
        title: "Create your permanent link",
        body: `StackPay reserves one checkout route for ${merchantName || "your business"}.`,
      },
      {
        icon: Wallet,
        title: "Confirm in your wallet",
        body: "Approve one transaction so the link is registered on-chain. It can take a minute to confirm.",
      },
      {
        icon: Printer,
        title: "Print or display the code",
        body: "Download it as a PNG or SVG. It stays the same unless you choose to regenerate it.",
      },
    ];

    return (
      <div>
        {header}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="card overflow-hidden">
            <div className="card-header">
              <div>
                <h2 className="card-title">Set up Universal QR</h2>
                <p className="card-description">A one-time setup. No amounts to configure.</p>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <ol className="space-y-5">
                {steps.map(({ icon: Icon, title, body }, index) => (
                  <li key={title} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-subtle text-fg-2">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <h3 className="text-sm font-semibold text-fg">
                        <span className="sr-only">Step {index + 1}: </span>
                        {title}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-6 space-y-4 border-t border-line pt-6">
                {submitting ? (
                  <div className="alert" role="status">
                    <RefreshCw size={18} className="mt-0.5 shrink-0 animate-spin text-muted" aria-hidden="true" />
                    <span>
                      Confirm the transaction in your wallet. Your QR code appears here once it’s confirmed on-chain.
                    </span>
                  </div>
                ) : null}
                {errorAlert}
                <button
                  type="button"
                  onClick={() => void handleGenerate(false)}
                  disabled={submitting || loading}
                  className="btn btn-primary w-full sm:w-auto"
                >
                  <QrCode size={18} aria-hidden="true" />
                  {submitting ? "Setting up…" : "Create my QR code"}
                </button>
              </div>
            </div>
          </section>

          <aside className="card p-5 sm:p-6">
            <QrPreview caption="Preview" />
            <ul className="mt-6 space-y-4 border-t border-line pt-5 text-sm text-fg-2">
              <li className="flex gap-3">
                <Check size={17} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                Accepts sBTC, STX, and USDCx
              </li>
              <li className="flex gap-3">
                <Check size={17} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                Customers choose the asset and amount
              </li>
              <li className="flex gap-3">
                <Check size={17} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                Payments go to your settlement wallet
              </li>
            </ul>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden" aria-labelledby="qr-title">
          <div className="card-header">
            <div className="min-w-0">
              <h2 id="qr-title" className="card-title">
                {merchantName || "Your QR code"}
              </h2>
              <p className="card-description">Scan to pay in sBTC, STX, or USDCx.</p>
            </div>
            {statusBadge ? <span className={`badge ${statusBadge.tone}`}>{statusBadge.label}</span> : null}
          </div>

          <div className="p-5 sm:p-8">
            <div className="rounded-card border border-line bg-subtle px-4 py-8 sm:py-10">
              <QrPreview value={hostedUrl || null} label="" size={248} />
            </div>

            {!isLive ? (
              <div className="alert alert-warning mt-5" role="status">
                Waiting for on-chain confirmation. You can share the code now, but it becomes active once the
                transaction confirms.
              </div>
            ) : null}

            <div className="mt-6">
              <label className="label" htmlFor="qr-url">
                Checkout link
              </label>
              <div className="flex gap-2">
                <input
                  id="qr-url"
                  className="field min-w-0 flex-1 font-mono !text-sm"
                  value={hostedUrl || hostedHref}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" onClick={handleCopy} className="btn btn-secondary shrink-0" aria-live="polite">
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => void handleDownload("png")}
                disabled={!hostedUrl}
                className="btn btn-primary w-full sm:w-auto"
              >
                <Download size={17} aria-hidden="true" />
                Download PNG
              </button>
              <button
                type="button"
                onClick={() => void handleDownload("svg")}
                disabled={!hostedUrl}
                className="btn btn-secondary w-full sm:w-auto"
              >
                <Download size={17} aria-hidden="true" />
                Download SVG
              </button>
              <a
                href={hostedHref}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary w-full sm:w-auto"
              >
                Open checkout
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="hint">PNG is best for sharing and screens. SVG stays sharp at any print size.</p>
            {downloadError ? (
              <div className="alert alert-danger mt-4" role="alert">
                {downloadError}
              </div>
            ) : null}
          </div>
        </section>

        <div className="grid content-start gap-4">
          <section className="card overflow-hidden" aria-labelledby="qr-details-title">
            <div className="card-header">
              <div>
                <h2 id="qr-details-title" className="card-title">
                  {isLive ? "Your QR code is live" : "Awaiting confirmation"}
                </h2>
                <p className="card-description">
                  {isLive ? "Ready for your next customer." : "Registering your link on-chain."}
                </p>
              </div>
            </div>
            <dl className="divide-y divide-line text-sm">
              <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                <dt className="text-muted">Accepted assets</dt>
                <dd className="text-right text-fg">sBTC, STX, USDCx</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                <dt className="text-muted">Pays out to</dt>
                <dd className="text-right font-mono text-fg" title={settlementWallet || undefined}>
                  {settlementWallet ? truncateAddress(settlementWallet) : "Not set"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                <dt className="text-muted">Link name</dt>
                <dd className="min-w-0 truncate text-right font-mono text-fg">{universalLink.slug}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="qr-manage-title">
            <h2 id="qr-manage-title" className="card-title">
              Manage
            </h2>
            <p className="mt-1 text-sm text-muted">
              Regenerating creates a new code with a new link. Replace any printed copies afterwards.
            </p>
            {error ? <div className="mt-4">{errorAlert}</div> : null}
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void handleGenerate(true)}
                disabled={submitting}
                className="btn btn-secondary w-full"
              >
                <RefreshCw size={16} className={submitting ? "animate-spin" : undefined} aria-hidden="true" />
                {submitting ? "Regenerating…" : "Regenerate QR code"}
              </button>
              <Link href="/payment-links" className="btn btn-ghost w-full">
                <Link2 size={16} aria-hidden="true" />
                View payment links
              </Link>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex gap-3">
              <ScanLine size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-fg">How customers pay</h2>
                <p className="mt-1 text-sm text-muted">
                  They scan with their phone camera, choose an asset, enter the amount, and confirm in their Stacks
                  wallet.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
