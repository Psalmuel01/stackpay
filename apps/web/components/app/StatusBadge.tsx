import { cn } from "@/components/cn";

const styles: Record<string, string> = {
  Settled: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  Paid: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  Pending: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  Active: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  Draft: "border-white/10 bg-white/5 text-white/60",
  Expired: "border-white/10 bg-white/5 text-white/45",
  Failed: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export default function StatusBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
        styles[label] ?? "border-white/10 bg-white/5 text-white/60",
        className
      )}
    >
      {label}
    </span>
  );
}
