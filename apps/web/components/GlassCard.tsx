import { ReactNode } from "react";
import { cn } from "./cn";

/** The standard content surface. Kept under its original name for existing imports. */
export default function GlassCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("card p-5 sm:p-6", className)}>{children}</div>;
}
