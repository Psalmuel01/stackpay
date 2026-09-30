"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { cn } from "@/components/cn";

/**
 * Renders a real, scannable QR code for `value` (a full URL).
 * Without a `value` a calm placeholder is shown instead — we never draw a fake code.
 * The code always sits on a pure white tile so it scans in both themes.
 */
export default function QrPreview({
  value,
  label,
  caption,
  size = 220,
  className,
}: {
  /** The exact string to encode, e.g. https://stackpay.app/pay/link/lumen. */
  value?: string | null;
  /** Display text shown under the code. Defaults to `value`. Never encoded. */
  label?: string;
  caption?: string;
  /** Rendered edge length of the code tile in px. */
  size?: number;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);

    if (!value) {
      return;
    }

    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then((markup) => {
        if (!cancelled) {
          setSvg(markup);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  const displayText = label ?? value ?? "";
  const hasCode = Boolean(value) && !failed;

  return (
    <figure className={cn("flex flex-col items-center text-center", className)}>
      {hasCode ? (
        // Pure white tile on purpose: scanners need dark modules on a light quiet zone in either theme.
        <div
          className="rounded-xl border border-line bg-white p-3 shadow-sm"
          style={{ width: size + 24, maxWidth: "100%" }}
        >
          {svg ? (
            <div
              role="img"
              aria-label={`QR code for ${value}`}
              className="aspect-square w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-md bg-[#ececec]" aria-hidden="true" />
          )}
        </div>
      ) : (
        <div
          className="grid aspect-square place-items-center rounded-xl border border-dashed border-line-strong bg-subtle p-6"
          style={{ width: size + 24, maxWidth: "100%" }}
        >
          <div className="flex flex-col items-center gap-3">
            <span className="empty-state-icon !mb-0" aria-hidden="true">
              <QrCode size={22} />
            </span>
            <p className="max-w-[180px] text-sm text-muted">
              {failed ? "This QR code couldn’t be generated." : "Your QR code appears here"}
            </p>
          </div>
        </div>
      )}

      {caption || (hasCode && displayText) ? (
        <figcaption className="mt-4 w-full min-w-0">
          {caption ? <div className="text-sm font-medium text-fg-2">{caption}</div> : null}
          {hasCode && displayText ? (
            <div className="mx-auto mt-1 max-w-full truncate font-mono text-sm text-muted" title={displayText}>
              {displayText}
            </div>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
