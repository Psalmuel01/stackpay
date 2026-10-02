"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { TOPICS, topicHref } from "./topics";

/** Old single-page links (/docs#api) still work: send them to the topic's own page. */
function useLegacyHashRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/docs") return;
    const hash = window.location.hash.slice(1);
    if (hash && TOPICS.some((topic) => topic.slug === hash)) router.replace(topicHref(hash));
  }, [pathname, router]);
}

function TopicList({ query, onNavigate }: { query: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const filtered = TOPICS.filter((topic) => `${topic.title} ${topic.keywords}`.toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <nav aria-label="Documentation topics" className="mt-4">
      {filtered.length === 0 && <p role="status" className="px-1 py-3 text-sm text-muted">No matching topics. Try “wallet” or “webhook”.</p>}
      {filtered.map((topic, index) => {
        const href = topicHref(topic.slug);
        const active = pathname === href;
        return (
          <div key={topic.slug || "overview"}>
            {(index === 0 || topic.group !== filtered[index - 1].group) && (
              <p className={`mb-1.5 text-xs font-semibold text-fg ${index === 0 ? "" : "mt-6"}`}>{topic.group}</p>
            )}
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`-ml-px flex min-h-10 items-center border-l-2 py-1.5 pl-4 text-sm transition-colors ${active ? "border-accent font-medium text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"}`}
            >
              {topic.title}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

function SearchField({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">Find a documentation topic</span>
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a topic…" type="search" className="field pl-10" />
    </label>
  );
}

/** Desktop sidebar. */
export function DocsSidebar() {
  const [query, setQuery] = useState("");
  useLegacyHashRedirect();
  return (
    <aside className="hidden self-start lg:sticky lg:top-[104px] lg:block">
      <div className="max-h-[calc(100vh-140px)] overflow-y-auto pb-2 pr-1">
        <SearchField query={query} setQuery={setQuery} />
        <TopicList query={query} />
      </div>
      <a href="https://github.com/Psalmuel01/stackpay" className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-5 text-sm text-muted hover:text-fg">
        View source on GitHub <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </aside>
  );
}

/** Mobile topic menu. */
export function DocsMobileNav() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = TOPICS.find((topic) => topicHref(topic.slug) === pathname) ?? TOPICS[0];
  return (
    <details open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} className="group sticky top-16 z-30 -mx-4 border-b border-line bg-canvas/95 px-4 backdrop-blur-xl sm:top-[72px] sm:-mx-6 sm:px-6 lg:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-muted">Docs</span>
          <span className="text-line-strong" aria-hidden="true">/</span>
          <span className="truncate font-medium text-fg">{current.title}</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="max-h-[60vh] overflow-y-auto pb-5 pt-1">
        <SearchField query={query} setQuery={setQuery} />
        <TopicList query={query} onNavigate={() => setOpen(false)} />
      </div>
    </details>
  );
}
