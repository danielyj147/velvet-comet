"use client";

import * as React from "react";
import { useCommandRegister, type Cmd } from "../command/CommandProvider";
import type { SearchTrace, Tier, Candidate } from "../../searchtrace/types";
import { HoloCard } from "@/components/HoloCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = ["fast", "balanced", "thorough"];
const SOURCES = ["web", "news"] as const;
const CATEGORIES = ["research", "github", "pdf"] as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const relColor = (r: number) => (r > 0.55 ? "var(--green)" : r > 0.3 ? "var(--amber)" : "var(--muted)");

export default function SearchPage() {
  const [query, setQuery] = React.useState("small business accounting software");
  const [tier, setTier] = React.useState<Tier>("balanced");
  const [sources, setSources] = React.useState<string[]>(["web"]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [domainsText, setDomainsText] = React.useState("");
  const [diversity, setDiversity] = React.useState(0.3);
  const [minRelevance, setMinRelevance] = React.useState(0);
  const [trace, setTrace] = React.useState<SearchTrace | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const run = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          tier,
          sources,
          categories,
          nicheDomains: domainsText.split(",").map((s) => s.trim()).filter(Boolean),
          diversity,
          minRelevance,
          topK: 20,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "search failed");
      setTrace(json as SearchTrace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, tier, sources, categories, domainsText, diversity, minRelevance]);

  const jumpTo = React.useCallback((rank: number) => {
    document.getElementById(`result-${rank}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(rank);
    setTimeout(() => setFlash(null), 1500);
  }, []);

  const commands = React.useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [];
    for (const r of trace?.results ?? [])
      cmds.push({ id: `result-${r.finalRank}`, group: "Results", label: r.title || r.url, hint: r.domain, keywords: `${r.domain} ${r.url}`, perform: () => jumpTo(r.finalRank!) });
    for (const t of TIERS)
      cmds.push({ id: `tier-${t}`, group: "Settings", label: `Tier: ${t}`, hint: tier === t ? "current" : "", perform: () => setTier(t) });
    for (const s of SOURCES)
      cmds.push({ id: `src-${s}`, group: "Settings", label: `Toggle source: ${s}`, hint: sources.includes(s) ? "on" : "off", perform: () => toggle(sources, setSources, s) });
    for (const c of CATEGORIES)
      cmds.push({ id: `cat-${c}`, group: "Settings", label: `Toggle category: ${c}`, hint: categories.includes(c) ? "on" : "off", perform: () => toggle(categories, setCategories, c) });
    for (const d of [0, 0.3, 0.6, 0.9])
      cmds.push({ id: `div-${d}`, group: "Settings", label: `Diversity: ${d}`, hint: diversity === d ? "current" : "", perform: () => setDiversity(d) });
    cmds.push({ id: "act-run", group: "Actions", label: "Run search", perform: () => void run() });
    cmds.push({ id: "act-focus", group: "Actions", label: "Focus query box", perform: () => inputRef.current?.focus() });
    return cmds;
  }, [trace, tier, sources, categories, diversity, run, jumpTo]);
  useCommandRegister(commands, [commands]);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      {/* Search bar — the one obvious thing to do on arrival. */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search the web — with recall and precision you can see…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            className="h-11 w-full rounded-lg border bg-[var(--surface)] pl-10 pr-3 text-[15px] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <Button onClick={run} disabled={loading} className="h-11 px-6">
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[var(--muted)]">
        <div className="flex items-center gap-1.5">
          {TIERS.map((t) => (
            <button key={t} onClick={() => setTier(t)} className={cn("rounded-full border px-3 py-1", tier === t ? "border-[var(--primary)] text-[var(--foreground)]" : "")}>
              {t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          diversity <span className="tabular-nums text-[var(--foreground)]">{diversity.toFixed(1)}</span>
          <Slider value={[diversity]} min={0} max={1} step={0.1} onValueChange={([v]) => setDiversity(v!)} />
        </label>
        <label className="flex items-center gap-2">
          min rel <span className="tabular-nums text-[var(--foreground)]">{minRelevance.toFixed(2)}</span>
          <Slider value={[minRelevance]} min={0} max={0.6} step={0.05} onValueChange={([v]) => setMinRelevance(v!)} />
        </label>
        <div className="flex items-center gap-1.5">
          {[...SOURCES, ...CATEGORIES].map((x) => {
            const isSrc = (SOURCES as readonly string[]).includes(x);
            const on = (isSrc ? sources : categories).includes(x);
            return (
              <button key={x} onClick={() => toggle(isSrc ? sources : categories, isSrc ? setSources : setCategories, x)} className={cn("rounded-full border px-3 py-1", on ? "border-[var(--primary)] text-[var(--foreground)]" : "")}>
                {x}
              </button>
            );
          })}
        </div>
        <input
          value={domainsText}
          onChange={(e) => setDomainsText(e.target.value)}
          placeholder="niche domains: trade.com, regional.org"
          className="h-8 w-56 rounded-md border bg-[var(--surface-2)] px-2 text-xs outline-none focus:border-[var(--primary)]"
        />
      </div>

      {error && <div className="mt-6 rounded-lg border border-[var(--red)] bg-[var(--surface)] p-3 text-sm text-[var(--red)]">Error: {error}</div>}
      {!trace && !error && (
        <div className="mt-16 text-center text-[var(--muted)]">
          {loading ? "Running the pipeline…" : "Hit Search to see results and the trace behind them."}
        </div>
      )}

      {trace && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <Funnel trace={trace} />
            <Coverage trace={trace} />
            {trace.hints.length > 0 && (
              <Panel title="What to do">
                {trace.hints.map((h, i) => (
                  <div key={i} className="rounded-md border-l-2 border-[var(--primary)] bg-[var(--surface-2)] px-3 py-2 text-xs">{h}</div>
                ))}
              </Panel>
            )}
          </aside>
          <Results trace={trace} flash={flash} />
        </div>
      )}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Funnel({ trace }: { trace: SearchTrace }) {
  const max = Math.max(...trace.stages.map((s) => Math.max(s.countIn, s.countOut)), 1);
  return (
    <Panel title="Pipeline">
      {trace.stages.map((s) => (
        <div key={s.name} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs" title={s.note}>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate">{s.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-[var(--surface-2)]">
              <span className="block h-full bg-[var(--primary)]" style={{ width: pct(s.countOut / max) }} />
            </span>
          </div>
          <span className="tabular-nums text-[var(--muted)]">{s.countIn}→{s.countOut} · {s.ms}ms</span>
        </div>
      ))}
    </Panel>
  );
}

function Coverage({ trace }: { trace: SearchTrace }) {
  const c = trace.coverage;
  const recall = c.candidatesFound ? c.uniqueAfterDedup / c.candidatesFound : 0;
  return (
    <Panel title="Coverage">
      <Meter color="var(--blue)" label="recall pool" value={recall} note={`${c.candidatesFound}→${c.uniqueAfterDedup}`} />
      <Meter color="var(--green)" label="precision (mean rel)" value={c.meanRelevance} note={c.droppedLowRelevance ? `${c.droppedLowRelevance} gated` : "no gate"} />
      <Meter color="var(--amber)" label="source diversity" value={c.diversityIndex} note={`${c.uniqueDomains} domains`} />
      <div className="pt-1 text-[11px] text-[var(--muted)]">{c.duplicatesCollapsed} dup collapsed · {trace.lists.join(", ")}</div>
    </Panel>
  );
}

function Meter({ color, label, value, note }: { color: string; label: string; value: number; note: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="text-[var(--muted)]">{note}</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-[var(--surface-2)]">
        <div className="h-full" style={{ width: pct(Math.max(0, Math.min(1, value))), background: color }} />
      </div>
    </div>
  );
}

function Results({ trace, flash }: { trace: SearchTrace; flash: number | null }) {
  return (
    <div>
      <div className="mb-3 text-sm text-[var(--muted)]">
        {trace.results.length} results · expansions: {trace.expansions.map((e) => `"${e}"`).join(", ")}
      </div>
      <div className="space-y-3">
        {trace.results.map((r) => (
          <HoloCard key={r.canonicalUrl} className={cn("scroll-mt-20", flash === r.finalRank && "ring-2 ring-[var(--primary)]")}>
            <div id={`result-${r.finalRank}`} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-[var(--primary)]">
                  <span className="mr-1.5 text-[var(--muted)]">{r.finalRank}.</span>
                  {r.title || r.url}
                </a>
                <div className="mt-1 text-xs text-[var(--blue)]">{r.domain}</div>
              </div>
              <Badge style={{ color: relColor(r.relevance), borderColor: relColor(r.relevance) }}>
                rel {r.relevance.toFixed(2)}
              </Badge>
            </div>
            <Signals c={r} />
            <div className="mt-2 text-xs text-[var(--muted)]">{r.why}</div>
          </HoloCard>
        ))}
      </div>
    </div>
  );
}

/** The hybrid breakdown: how much each signal contributed to this result. */
function Signals({ c }: { c: Candidate }) {
  if (!c.signals) return null;
  const bars = [
    { label: "BM25", v: c.signals.bm25, color: "var(--amber)" },
    { label: "semantic", v: c.signals.dense, color: "var(--blue)" },
    { label: "consensus", v: c.signals.consensus, color: "var(--green)" },
  ];
  return (
    <div className="mt-3 flex gap-4">
      {bars.map((b) => (
        <div key={b.label} className="flex-1">
          <div className="mb-1 flex justify-between text-[10px] text-[var(--muted)]">
            <span>{b.label}</span>
            <span>{b.v == null ? "—" : b.v.toFixed(2)}</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-[var(--surface-2)]">
            <div className="h-full" style={{ width: pct(b.v ?? 0), background: b.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
