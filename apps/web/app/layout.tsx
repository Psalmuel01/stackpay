import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// Fallback for platforms without Avenir Next. Not preloaded: Apple devices
// render Avenir Next and never need to download it.
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "StackPay — Bitcoin-native payments on Stacks",
  description:
    "StackPay is a Bitcoin-native payment gateway on Stacks for sBTC, STX, and USDCx. Create invoices, share payment links, and manage manual on-chain settlements.",
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
