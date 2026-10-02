import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { OG_IMAGE, SITE, openGraph, siteUrl } from "@/lib/site";

// Fallback for platforms without Avenir Next. Not preloaded: Apple devices
// render Avenir Next and never need to download it.
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: SITE.title, template: "%s — StackPay" },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: SITE.keywords,
  creator: "Samuel Dahunsi",
  openGraph: openGraph(),
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    images: [OG_IMAGE],
  },
  // Search engine ownership checks (Google Search Console, Bing Webmaster Tools), set per deployment.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  icons: {
    icon: "/stackpay-icon.svg",
    shortcut: "/stackpay-icon.svg",
    apple: "/stackpay-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f6" },
  ],
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={figtree.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){var t;try{t=localStorage.getItem("stackpay-theme")}catch(e){}document.documentElement.dataset.theme=t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()` }}/></head>
      <body>
        {children}
      </body>
    </html>
  );
}
