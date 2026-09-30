import Image from "next/image";
import { cn } from "./cn";

export type TokenSymbol = "sBTC" | "STX" | "USDCx";

// Official token artwork: sBTC and USDCx from their on-chain token metadata (via Hiro), STX from the Stacks brand mark.
const logos: Record<TokenSymbol, string> = {
  sBTC: "/tokens/sbtc.png",
  STX: "/tokens/stx.svg",
  USDCx: "/tokens/usdcx.png",
};

export const tokenOrder: TokenSymbol[] = ["sBTC", "STX", "USDCx"];

/** Round token logo. Decorative by default; pass `label` when it stands alone without the symbol next to it. */
export default function TokenLogo({
  token,
  size = 24,
  label,
  className,
}: {
  token: TokenSymbol;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <Image
      src={logos[token]}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
