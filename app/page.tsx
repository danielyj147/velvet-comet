import Link from "next/link";
import { HoloCard } from "@/components/HoloCard";
import { Search, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-20">
      <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
        Search that&apos;s actually <span className="text-[var(--primary)]">complete</span>.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-[var(--muted)]">
        A bigger result limit just gives you more of the same popular sites. This finds the
        trade pubs, regional press, and niche sources that never surface — and shows you
        how complete the search actually was.
      </p>

      <div className="mt-12">
        <Link href="/search">
          <HoloCard className="group p-7">
            <Search className="h-6 w-6 text-[var(--primary)]" />
            <h3 className="mt-3 text-lg font-semibold">Open search</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Type a query → complete, de-duplicated, source-diverse results, with a visible
              account of what was searched and why each result is there.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--primary)]">
              Try it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </HoloCard>
        </Link>
      </div>

      <p className="mt-10 text-center text-xs text-[var(--muted)]">
        Press <kbd className="rounded border px-1.5 py-0.5">⌘K</kbd> anywhere to search or jump
        to a result.
      </p>

      <details className="mx-auto mt-10 max-w-2xl rounded-xl border bg-[var(--surface)]/60 p-4 text-sm text-[var(--muted)]">
        <summary className="cursor-pointer font-medium text-[var(--foreground)]">Why this exists</summary>
        <p className="mt-3">
          For work where <strong>completeness is the product</strong> — landscape reports,
          competitive intelligence — a ranked list is a black box: you can&apos;t tell what it
          missed, what got duplicated, or why something ranked. Raising the limit just returns
          more of the same popular domains; the long tail never shows up at any limit.
        </p>
        <p className="mt-2">
          This makes retrieval <strong>observable and tunable</strong>: it widens coverage across
          sources and the long tail, collapses duplicates, diversifies domains, and shows the
          whole pipeline — so you can trust the result, and tune it.
        </p>
      </details>
    </main>
  );
}
