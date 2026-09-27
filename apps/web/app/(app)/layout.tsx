import MerchantAuthGate from "@/components/app/MerchantAuthGate";
import AppHeader from "@/components/app/AppHeader";
import MobileNav from "@/components/app/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="py-10">
        <div className="mx-auto w-full max-w-6xl px-6"><MerchantAuthGate>{children}</MerchantAuthGate></div>
      </main>
      <MobileNav />
    </div>
  );
}
