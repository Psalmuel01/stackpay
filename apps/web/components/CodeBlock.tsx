"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlight, tokenLines, type CodeLanguage } from "@/lib/highlight";
import { cn } from "@/components/cn";

const LANGUAGE_LABEL: Record<CodeLanguage, string> = { ts: "TypeScript", bash: "Shell", json: "JSON" };

/** Editor-style code snippet: title bar, copy button, line numbers, and syntax colours. */
export default function CodeBlock({
  code,
  lang,
  title,
  className,
}: {
  code: string;
  lang: CodeLanguage;
  /** Shown in the title bar; defaults to the language name. */
  title?: string;
  className?: string;
}) {
  const lines = useMemo(() => tokenLines(highlight(code, lang)), [code, lang]);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard can be blocked; the code remains selectable. */
    }
  }

  const label = title ?? LANGUAGE_LABEL[lang];
  return (
    <figure className={cn("code-block", className)}>
      <figcaption className="code-block-bar">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="code-block-dot" />
            <span className="code-block-dot" />
            <span className="code-block-dot" />
          </span>
          <span className="code-block-title">{label}</span>
        </span>
        <button type="button" onClick={() => void copy()} className="code-block-copy" aria-label={copied ? `${label} copied` : `Copy ${label} code`}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre tabIndex={0}>
        <code>
          {lines.map((line, index) => (
            <span key={index} className="code-line">
              {line.map((token, tokenIndex) =>
                token.type ? (
                  <span key={tokenIndex} className={`tok-${token.type}`}>{token.text}</span>
                ) : (
                  token.text
                )
              )}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
