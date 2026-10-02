import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, Info } from "lucide-react";
import { TOPICS, topicHref } from "./topics";

export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warning" }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div className={`alert my-5 text-sm leading-6 ${tone === "warning" ? "alert-warning" : ""}`}>
      <Icon size={16} aria-hidden="true" className={`mt-1 shrink-0 ${tone === "warning" ? "" : "text-muted"}`} />
      <div>{children}</div>
    </div>
  );
}

export function Steps({ items }: { items: string[] }) {
  return (
    <ol className="my-6 space-y-4">
      {items.map((item, i) => (
        <li key={item} className="flex gap-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-subtle text-xs font-semibold tabular-nums text-fg-2">
            {i + 1}
          </span>
          <span className="text-fg-2">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[0.875em] text-fg">{children}</code>;
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-lg font-semibold text-fg">{children}</h2>;
}

/** Frame for one documentation page: group label, title, content, and previous/next links. */
export function DocPage({ slug, children }: { slug: string; children: React.ReactNode }) {
  const index = TOPICS.findIndex((topic) => topic.slug === slug);
  const topic = TOPICS[index];
  const previous = TOPICS[index - 1];
  const next = TOPICS[index + 1];
  return (
    <article className="min-w-0 max-w-[720px] pb-12">
      <p className="mb-3 text-sm font-medium text-accent-text">{topic.group}</p>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{topic.title}</h1>
      <div className="space-y-5 text-base leading-7 text-fg-2">{children}</div>

      <nav aria-label="More documentation" className="mt-14 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
        {previous ? (
          <Link href={topicHref(previous.slug)} className="card group flex flex-col gap-1 p-5 transition-colors hover:border-line-strong">
            <span className="flex items-center gap-1.5 text-sm text-muted"><ArrowLeft size={15} aria-hidden="true" /> Previous</span>
            <span className="font-semibold text-fg">{previous.title}</span>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={topicHref(next.slug)} className="card group flex flex-col items-end gap-1 p-5 text-right transition-colors hover:border-line-strong">
            <span className="flex items-center gap-1.5 text-sm text-muted">Next <ArrowRight size={15} aria-hidden="true" /></span>
            <span className="font-semibold text-fg">{next.title}</span>
          </Link>
        ) : null}
      </nav>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>Found a gap in the docs?</span>
        <a href="https://github.com/Psalmuel01/stackpay/issues" className="link inline-flex min-h-10 items-center gap-1">
          Open an issue <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
