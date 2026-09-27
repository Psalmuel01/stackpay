import type { Metadata } from "next";
import { DemoProvider } from "@/components/app/DemoProvider";
import "./globals.css";

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

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
