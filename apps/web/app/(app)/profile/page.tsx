"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Store, Wallet } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import { CheckoutPreview, CopyButton, ProfileSection } from "@/components/app/profile/ProfileParts";
import { getConnectedWalletAddress } from "@/lib/stacks";

type MerchantProfile = {
  display_name?: string;
  company_name?: string;
  email?: string;
  slug?: string;
  settlement_wallet?: string | null;
  webhook_url?: string | null;
  default_currency?: "sBTC" | "STX" | "USDCx";
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function previewSlug(value: string, currentSlug?: string) {
  if (currentSlug) {
    return currentSlug;
  }

  const base = slugify(value);
  return base ? `${base}-xxxxxx` : "";
}

export default function ProfilePage() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<MerchantProfile>({
    default_currency: "sBTC",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSettlement, setEditingSettlement] = useState(false);
  const [settlementDraft, setSettlementDraft] = useState("");

  useEffect(() => {
    setConnectedAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setProfile({ default_currency: "sBTC" });
      setSettlementDraft("");
      return;
    }

    let cancelled = false;

    fetch(`/api/merchant/profile?walletAddress=${encodeURIComponent(connectedAddress)}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const payload = await response.json();
        return (payload.data ?? null) as MerchantProfile | null;
      })
      .then((merchant) => {
        if (cancelled) {
          return;
        }

        const settlementWallet = merchant?.settlement_wallet ?? connectedAddress;

        setProfile({
          display_name: merchant?.display_name ?? "",
          company_name: merchant?.company_name ?? "",
          email: merchant?.email ?? "",
          slug: merchant?.slug ?? "",
          settlement_wallet: settlementWallet,
          webhook_url: merchant?.webhook_url ?? "",
          default_currency: merchant?.default_currency ?? "sBTC",
        });
        setSettlementDraft(settlementWallet);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile((current) => ({
            ...current,
            settlement_wallet: connectedAddress,
          }));
          setSettlementDraft(connectedAddress);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  function updateField(field: keyof MerchantProfile, value: string) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!connectedAddress) {
      setError("Connect a wallet before saving your merchant profile.");
      return;
    }

    if ((profile.company_name ?? "").trim().length <= 6) {
      setError("Business name must be longer than 6 characters.");
      return;
    }

    if (!(profile.display_name ?? "").trim()) {
      setError("Display name is required.");
      return;
    }

    if (!(profile.email ?? "").trim()) {
      setError("Email address is required.");
      return;
    }

    if (!isValidEmail((profile.email ?? "").trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);

    try {
      const settlementWallet = settlementDraft.trim() || connectedAddress;
      const response = await fetch("/api/merchant/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          displayName: profile.display_name ?? "",
          companyName: profile.company_name ?? "",
          email: profile.email ?? "",
          settlementWallet,
          webhookUrl: profile.webhook_url || "",
          defaultCurrency: profile.default_currency ?? "sBTC",
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to save merchant profile.");
      }

      const merchant = payload.data as MerchantProfile;
      const nextSettlementWallet = merchant.settlement_wallet ?? connectedAddress;

      setProfile({
        display_name: merchant.display_name ?? "",
        company_name: merchant.company_name ?? "",
        email: merchant.email ?? "",
        slug: merchant.slug ?? "",
        settlement_wallet: nextSettlementWallet,
        webhook_url: merchant.webhook_url ?? "",
        default_currency: merchant.default_currency ?? "sBTC",
      });
      setSettlementDraft(nextSettlementWallet);
      setEditingSettlement(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save merchant profile.");
    } finally {
      setSaving(false);
    }
  }

  const resolvedSettlement = settlementDraft || profile.settlement_wallet || connectedAddress || "";
  const merchantName = (profile.company_name || profile.display_name || "").trim();
  const derivedSlug = previewSlug(profile.company_name ?? "", profile.slug ?? "");
  const loading = profile.settlement_wallet === undefined;
  const isNew = !loading && !profile.slug;
  const settlementIsConnected = Boolean(connectedAddress) && resolvedSettlement === connectedAddress;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Merchant profile"
        subtitle="Your business name appears on every checkout, invoice and receipt. Payouts go to your settlement wallet."
      />

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {isNew ? (
            <div className="card flex gap-4 border-accent/30 bg-accent/5 p-5 sm:p-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-text" aria-hidden="true">
                <Store size={20} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-fg">Set up your merchant profile</h2>
                <p className="mt-1 text-sm leading-relaxed text-fg-2">
                  Add your business name and a contact email, then save. You need a saved profile before you can create
                  invoices, payment links or a Universal QR code.
                </p>
              </div>
            </div>
          ) : null}

          <ProfileSection
            id="business-title"
            title="Business details"
            description="Customers see your business name at the top of every checkout, invoice and receipt."
          >
            <div>
              <label className="label" htmlFor="company-name">
                Business name
              </label>
              <input
                id="company-name"
                className="field"
                value={profile.company_name ?? ""}
                onChange={(event) => updateField("company_name", event.target.value)}
                placeholder="e.g. Lumen Studio Ltd"
                autoComplete="organization"
                aria-describedby="company-name-hint"
              />
              <p id="company-name-hint" className="hint text-sm">
                Your public name. Use at least 7 characters.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="display-name">
                  Display name
                </label>
                <input
                  id="display-name"
                  className="field"
                  value={profile.display_name ?? ""}
                  onChange={(event) => updateField("display_name", event.target.value)}
                  placeholder="e.g. Lumen"
                  aria-describedby="display-name-hint"
                  required
                />
                <p id="display-name-hint" className="hint text-sm">
                  A shorter name for your console. Shown if no business name is set.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="merchant-handle">
                  Merchant handle
                </label>
                <input
                  id="merchant-handle"
                  className="field font-mono placeholder:font-sans"
                  value={derivedSlug}
                  placeholder="Created when you save"
                  readOnly
                  aria-describedby="merchant-handle-hint"
                />
                <p id="merchant-handle-hint" className="hint text-sm">
                  {profile.slug
                    ? "Your permanent merchant ID. It stays the same if you rename your business."
                    : "Generated from your business name the first time you save."}
                </p>
              </div>
            </div>

            <CheckoutPreview name={merchantName} />
          </ProfileSection>

          <ProfileSection
            id="payouts-title"
            title="Payouts"
            description="Where StackPay sends money from paid invoices. It can be your connected wallet or any other Stacks address you control."
          >
            <div>
              <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg-2" id="settlement-label">
                    Settlement wallet
                  </span>
                  {settlementIsConnected && !editingSettlement ? (
                    <span className="badge badge-neutral">Connected wallet</span>
                  ) : null}
                </div>
                {!editingSettlement ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSettlement((current) => !current);
                      setSettlementDraft(profile.settlement_wallet ?? connectedAddress ?? "");
                    }}
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    <Pencil size={15} aria-hidden="true" />
                    {profile.settlement_wallet ? "Change" : "Set wallet"}
                  </button>
                ) : null}
              </div>

              {editingSettlement ? (
                <div className="well space-y-4 p-4">
                  <input
                    id="settlement-wallet"
                    className="field font-mono"
                    aria-labelledby="settlement-label"
                    aria-describedby="settlement-hint"
                    value={settlementDraft}
                    onChange={(event) => setSettlementDraft(event.target.value)}
                    placeholder={connectedAddress ?? "Connect wallet first"}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSettlementDraft(connectedAddress ?? "")}
                      className="btn btn-secondary btn-sm"
                    >
                      <Wallet size={16} aria-hidden="true" />
                      Use connected wallet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSettlement((current) => !current);
                        setSettlementDraft(profile.settlement_wallet ?? connectedAddress ?? "");
                      }}
                      className="btn btn-ghost btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="well flex items-center gap-3 py-2 pl-4 pr-2">
                  <span className="min-w-0 flex-1 break-all py-1 font-mono text-sm text-fg" aria-labelledby="settlement-label">
                    {resolvedSettlement || "Uses your connected wallet"}
                  </span>
                  <CopyButton value={resolvedSettlement} label="settlement wallet address" />
                </div>
              )}
              <p id="settlement-hint" className="hint text-sm">
                Leave it empty to receive payouts in your connected wallet. Changes take effect when you save.
              </p>
            </div>

            <div>
              <span className="label" id="connected-label">
                Connected wallet
              </span>
              <div className="well flex items-center gap-3 py-2 pl-4 pr-2">
                <span className="min-w-0 flex-1 break-all py-1 font-mono text-sm text-fg-2" aria-labelledby="connected-label">
                  {connectedAddress ?? "No wallet connected"}
                </span>
                {connectedAddress ? <CopyButton value={connectedAddress} label="connected wallet address" /> : null}
              </div>
              <p className="hint text-sm">
                Signs invoices and other on-chain actions for your account. To use a different one, switch wallets from the top bar.
              </p>
            </div>
          </ProfileSection>

          <ProfileSection
            id="contact-title"
            title="Contact & notifications"
            description="How StackPay reaches you. Not shown to customers."
          >
            <div>
              <label className="label" htmlFor="email">
                Account email
              </label>
              <input
                id="email"
                className="field"
                type="email"
                value={profile.email ?? ""}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="you@business.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="well flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-fg">Webhooks and API keys</p>
                <p className="mt-0.5 text-sm text-muted">Signed payment events and server-side API access are managed on the Developer page.</p>
              </div>
              <Link href="/developer" className="btn btn-secondary btn-sm shrink-0">Open Developer</Link>
            </div>
          </ProfileSection>

          {error ? (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-muted" role="status" aria-live="polite">
              {saving ? (
                "Saving your profile…"
              ) : saved ? (
                <span className="inline-flex items-center gap-2 font-medium text-success">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Profile saved
                </span>
              ) : isNew ? (
                "Save once to start taking payments."
              ) : (
                "Changes apply to checkouts once you save."
              )}
            </p>
            <button type="submit" disabled={saving} className="btn btn-primary w-full sm:w-auto" aria-busy={saving}>
              {saving ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : null}
              {saving ? "Saving…" : isNew ? "Save profile" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {[3, 2, 2].map((rows, index) => (
        <div key={index} className="card p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-x-10">
            <div className="space-y-4">
              <div className="skeleton h-5 w-36" />
              <div className="skeleton h-4 w-full max-w-[240px]" />
              <div className="skeleton h-4 w-44" />
            </div>
            <div className="space-y-5">
              {Array.from({ length: rows }).map((_, row) => (
                <div key={row} className="space-y-2">
                  <div className="skeleton h-4 w-28" />
                  <div className="skeleton h-11 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
