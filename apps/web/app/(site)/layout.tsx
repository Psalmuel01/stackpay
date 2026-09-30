import SiteHeader from "@/components/app/SiteHeader";

// The marketing site and docs keep the dark brand look regardless of theme.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-screen bg-canvas text-fg">
      <SiteHeader />
      {children}
    </div>
  );
}
