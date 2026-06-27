import Link from "next/link";
import { HoloCard } from "@/components/HoloCard";
import { Search, ListChecks, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-16">
      <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
        See <span className="text-[var(--primary)]">why</span>, not just what.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-[var(--muted)]">
        Web data, with the reasoning made visible. Two surfaces — pick one.
      </p>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <Link href="/search">
          <HoloCard className="group h-full p-6">
            <Search className="h-6 w-6 text-[var(--primary)]" />
            <h3 className="mt-3 text-lg font-semibold">Search</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Type a query → a ranked answer <em>and</em> the pipeline behind it: recall,
              precision, and why each result is here.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--primary)]">
              Try it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </HoloCard>
        </Link>

        <Link href="/flows">
          <HoloCard className="group h-full p-6">
            <ListChecks className="h-6 w-6 text-[var(--primary)]" />
            <h3 className="mt-3 text-lg font-semibold">Flows</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Run a multi-step browser flow → the exact step that failed, why, and a
              screenshot of the page at that moment.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--primary)]">
              Try it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </HoloCard>
        </Link>
      </div>

      <p className="mt-10 text-center text-xs text-[var(--muted)]">
        Press <kbd className="rounded border px-1.5 py-0.5">⌘K</kbd> anywhere to search,
        jump, or toggle settings.
      </p>

      {/* Kept generic for public hosting — the detailed, sourced rationale lives in
          the repo docs (the take-home submission), not the live site. */}
      <details className="mx-auto mt-10 max-w-2xl rounded-xl border bg-[var(--surface)]/60 p-4 text-sm text-[var(--muted)]">
        <summary className="cursor-pointer font-medium text-[var(--foreground)]">
          Why this exists
        </summary>
        <p className="mt-3">
          Web-data APIs hand back opaque results: one ranked list, or one
          <code> SCRAPE_FAILED</code> with no idea which of fourteen steps broke.
        </p>
        <p className="mt-2">
          <strong>Search</strong> makes retrieval — recall, precision, and ranking — observable and
          tunable instead of a black-box list. <strong>Flows</strong> makes a browser automation&apos;s
          failure legible: which step, why, and the page at that moment.
        </p>
      </details>
    </main>
  );
}
