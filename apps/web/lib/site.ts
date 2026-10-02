/**
 * Public site identity for SEO: canonical URLs, sitemap, social previews, structured data.
 * Set NEXT_PUBLIC_SITE_URL to the canonical origin (e.g. your custom domain) and everything
 * follows it; otherwise the app URL is used.
 */
export const SITE = {
  name: "StackPay",
  title: "StackPay — Bitcoin payments for developers and merchants",
  description:
    "Accept sBTC, STX and USDCx with hosted checkout, payment links, QR codes and a developer-first API with signed webhooks. Payments settle on Stacks, secured by Bitcoin.",
  keywords: [
    "sBTC payments", "accept sBTC", "Bitcoin payment gateway", "Bitcoin payment API", "Stacks payments",
    "STX payments", "USDCx", "crypto checkout", "Bitcoin invoices", "Bitcoin webhooks", "Stripe for Bitcoin",
  ],
  github: "https://github.com/Psalmuel01/stackpay",
  npm: "https://www.npmjs.com/package/stackpay",
  demo: "https://youtu.be/dcz9mq1vNf4",
};

/** Social preview image (1200×630), shared by every page's Open Graph and Twitter tags. */
export const OG_IMAGE = { url: "/og.jpg", width: 1200, height: 630, alt: "StackPay — Stripe for Bitcoin. Accept sBTC, STX and USDCx on Stacks." };

/** Open Graph fields for a page. Next.js replaces (not merges) a parent's openGraph, so pages build on this. */
export function openGraph(overrides: { url?: string; title?: string; description?: string } = {}) {
  return {
    type: "website" as const,
    siteName: SITE.name,
    locale: "en_US",
    title: overrides.title ?? SITE.title,
    description: overrides.description ?? SITE.description,
    images: [OG_IMAGE],
    ...(overrides.url ? { url: overrides.url } : {}),
  };
}

export function siteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://stackpay.vercel.app";
  try {
    return new URL(configured);
  } catch {
    return new URL("https://stackpay.vercel.app");
  }
}
