import MerchantAuthGate from "@/components/app/MerchantAuthGate";
import AppHeader from "@/components/app/AppHeader";
import MobileNav from "@/components/app/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main id="main-content" className="pb-28 pt-8 md:py-10">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6"><MerchantAuthGate>{children}</MerchantAuthGate></div>
      </main>
      <MobileNav />
    </div>
  );
}
