import { cn } from "@/components/cn";

const tones: Record<string, string> = {
  Settled: "badge-success",
  Paid: "badge-success",
  Delivered: "badge-success",
  Completed: "badge-success",
  Live: "badge-success",
  Pending: "badge-warning",
  Paused: "badge-warning",
  Active: "badge-info",
  Inactive: "badge-neutral",
  Draft: "badge-neutral",
  Expired: "badge-neutral",
  Archived: "badge-neutral",
  Canceled: "badge-neutral",
  Failed: "badge-danger",
};

export default function StatusBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return <span className={cn("badge", tones[label] ?? "badge-neutral", className)}>{label}</span>;
}
