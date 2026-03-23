import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo size={38} />
          <p className="mt-3 max-w-md text-sm leading-6 text-white/42">
            Bitcoin-native payments on Stacks. Invoices, subscriptions, and
            automated settlements for modern businesses.
          </p>
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-white/50">
          {/* <span>Product</span>
          <span>Developers</span>
          <span>Security</span>
          <span>Status</span> */}
          <span>© 2026 StackPay. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
