import ConsoleShell from "@/components/app/ConsoleShell";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
