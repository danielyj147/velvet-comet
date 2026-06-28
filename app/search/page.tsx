"use client";

import * as React from "react";
import { useCommandRegister, type Cmd } from "../command/CommandProvider";
import type { SearchTrace, Tier, Candidate, Recency } from "../../searchtrace/types";
import type { SessionSummary } from "../../searchtrace/sessions";
import { HoloCard } from "@/components/HoloCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Search as SearchIcon, SlidersHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = ["fast", "balanced", "thorough"];
const SOURCES = ["web", "news"] as const;
const CATEGORIES = ["research", "github", "pdf"] as const;
const RECENCIES: Recency[] = ["any", "day", "week", "month", "year"];
const PROVIDER_LABEL: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", ollama: "Ollama (local)" };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const relColor = (r: number) => (r > 0.55 ? "var(--green)" : r > 0.3 ? "var(--amber)" : "var(--muted)");

export default function SearchPage() {
  // --- state (one search request, plus a few UI-only flags) ---
  const [query, setQuery] = React.useState("small business accounting software");
  const [sources, setSources] = React.useState<string[]>(["web"]);
  const [recency, setRecency] = React.useState<Recency>("any");
  // advanced (tucked away — sensible defaults so most users never touch these)
  const [tier, setTier] = React.useState<Tier>("balanced");
  const [categories, setCategories] = React.useState<string[]>([]);
  const [domainsText, setDomainsText] = React.useState("");
  const [diversity, setDiversity] = React.useState(0.3);
  const [minRelevance, setMinRelevance] = React.useState(0);
  const [scrapeContent, setScrapeContent] = React.useState(false);
  const [maxAge, setMaxAge] = React.useState(172800000);
  const [targetResults, setTargetResults] = React.useState(25);
  const [maxRounds, setMaxRounds] = React.useState(4);
  const [useAI, setUseAI] = React.useState(false);
  const [ai, setAi] = React.useState<{ allowed: boolean; reason: string; provider?: string }>({ allowed: false, reason: "" });

  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showInspect, setShowInspect] = React.useState(false);
  const [trace, setTrace] = React.useState<SearchTrace | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setAi({ allowed: !!c.allowed, reason: c.reason ?? "", provider: c.provider }))
      .catch(() => {});
  }, []);

  const refreshSessions = React.useCallback(
    () => fetch("/api/sessions").then((r) => r.json()).then(setSessions).catch(() => {}),
    [],
  );
  React.useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const openSession = React.useCallback(async (id: string) => {
    const t = await fetch(`/api/sessions/${id}`).then((r) => r.json());
    if (t?.query) {
      setTrace(t as SearchTrace);
      setActiveSession(id);
      setError(null);
    }
  }, []);

  const newSearch = () => {
    setActiveSession(null);
    setTrace(null);
    setError(null);
    inputRef.current?.focus();
  };

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
          recency,
          scrapeContent,
          maxAge,
          targetResults,
          maxRounds,
          diversity,
          minRelevance,
          useAI: ai.allowed && useAI,
          topK: targetResults,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "search failed");
      setTrace(json.trace as SearchTrace);
      setActiveSession(json.sessionId ?? null);
      refreshSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, tier, sources, categories, domainsText, recency, scrapeContent, maxAge, targetResults, maxRounds, diversity, minRelevance, useAI, ai.allowed, refreshSessions]);

  const jumpTo = React.useCallback((rank: number) => {
    document.getElementById(`result-${rank}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(rank);
    setTimeout(() => setFlash(null), 1500);
  }, []);

  // ⌘K: jump to any result, plus a few quick toggles.
  const commands = React.useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [];
    for (const r of trace?.results ?? [])
      cmds.push({ id: `result-${r.finalRank}`, group: "Results", label: r.title || r.url, hint: r.domain, keywords: `${r.domain} ${r.url}`, perform: () => jumpTo(r.finalRank!) });
    for (const s of SOURCES)
      cmds.push({ id: `src-${s}`, group: "Settings", label: `Toggle source: ${s}`, hint: sources.includes(s) ? "on" : "off", perform: () => toggle(sources, setSources, s) });
    for (const t of TIERS)
      cmds.push({ id: `tier-${t}`, group: "Settings", label: `Depth: ${t}`, hint: tier === t ? "current" : "", perform: () => setTier(t) });
    if (ai.allowed)
      cmds.push({ id: "ai", group: "Settings", label: `AI: ${useAI ? "on" : "off"}`, perform: () => setUseAI((v) => !v) });
    cmds.push({ id: "run", group: "Actions", label: "Run search", primary: true, hint: "⇧⏎", perform: () => void run() });
    cmds.push({ id: "focus", group: "Actions", label: "Focus search box", perform: () => inputRef.current?.focus() });
    return cmds;
  }, [trace, sources, tier, useAI, ai.allowed, run, jumpTo]);
  useCommandRegister(commands, [commands]);

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-5 pb-24 pt-8">
      <SessionsSidebar sessions={sessions} active={activeSession} onOpen={openSession} onNew={newSearch} />
      <main className="min-w-0 flex-1">
      {/* The one obvious thing to do: search. */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search the web…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            className="h-12 w-full rounded-xl border bg-[var(--surface)] pl-10 pr-3 text-[16px] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <Button onClick={run} disabled={loading} className="h-12 px-6 text-base">
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {/* Quick filters everyone understands; the rest hides behind "More". */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
        {SOURCES.map((s) => (
          <Chip key={s} on={sources.includes(s)} onClick={() => toggle(sources, setSources, s)}>{s}</Chip>
        ))}
        <select value={recency} onChange={(e) => setRecency(e.target.value as Recency)} className="rounded-full border bg-[var(--surface)] px-3 py-1">
          {RECENCIES.map((r) => <option key={r} value={r}>{r === "any" ? "any time" : `past ${r}`}</option>)}
        </select>
        <button onClick={() => setShowAdvanced((v) => !v)} className={cn("ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1", showAdvanced && "border-[var(--primary)] text-[var(--foreground)]")}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> More
        </button>
      </div>

      {showAdvanced && (
        <Advanced
          {...{ tier, setTier, categories, setCategories, domainsText, setDomainsText, diversity, setDiversity, minRelevance, setMinRelevance, scrapeContent, setScrapeContent, maxAge, setMaxAge, targetResults, setTargetResults, maxRounds, setMaxRounds, useAI, setUseAI, ai, toggle }}
        />
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-[var(--red)] bg-[var(--surface)] p-4">
          <Badge style={{ color: "var(--red)", borderColor: "var(--red)" }}>{searchErrorKind(error)}</Badge>
          <p className="mt-2 text-sm">{error}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{searchErrorHint(error)}</p>
        </div>
      )}
      {!trace && !error && (
        <div className="mt-16 text-center text-[var(--muted)]">
          {loading ? "Searching across sources…" : "Search to see complete, de-duplicated, diverse results — and how they were found."}
        </div>
      )}

      {trace && (
        <div className="mt-6">
          {activeSession && (
            <div className="mb-3 text-xs text-[var(--muted)]">viewing saved session — edit the query and search to run a new one</div>
          )}
          <CoverageStrip trace={trace} onInspect={() => setShowInspect((v) => !v)} inspecting={showInspect} />
          {showInspect && <Inspect trace={trace} />}
          <Results trace={trace} flash={flash} />
        </div>
      )}
      </main>
    </div>
  );
}

/** Studio sidebar: scrollable saved sessions (CLI batch + live), newest first. */
function SessionsSidebar({
  sessions,
  active,
  onOpen,
  onNew,
}: {
  sessions: SessionSummary[];
  active: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <button onClick={onNew} className="mb-3 w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-fg)]">
        + New search
      </button>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        Sessions ({sessions.length})
      </div>
      <div className="max-h-[calc(100vh-180px)] space-y-1 overflow-auto pr-1">
        {sessions.length === 0 && <div className="text-xs text-[var(--muted)]">No saved sessions yet. Run a search, or the CLI batch.</div>}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={cn(
              "w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 text-left",
              active === s.id ? "border-[var(--primary)]" : "border-[var(--border)]",
            )}
          >
            <div className="truncate text-sm">{s.query}</div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">
              {s.results} results · {s.domains} domains · {fmt(s.savedAt)}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

// --------------------------------------------------------------------------
// Small building blocks
// --------------------------------------------------------------------------

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full border px-3 py-1", on ? "border-[var(--primary)] text-[var(--foreground)]" : "")}>
      {children}
    </button>
  );
}

/** The advanced controls — power knobs with good defaults, kept out of the way. */
function Advanced(p: any) {
  return (
    <div className="mt-3 grid gap-x-6 gap-y-3 rounded-xl border bg-[var(--surface)] p-4 text-sm text-[var(--muted)] sm:grid-cols-2">
      <label className="flex items-center justify-between gap-2">
        depth
        <span className="flex gap-1">
          {TIERS.map((t) => (
            <Chip key={t} on={p.tier === t} onClick={() => p.setTier(t)}>{t}</Chip>
          ))}
        </span>
      </label>
      <label className="flex items-center justify-between gap-2">
        diversity <span className="tabular-nums text-[var(--foreground)]">{p.diversity.toFixed(1)}</span>
        <Slider value={[p.diversity]} min={0} max={1} step={0.1} onValueChange={([v]: number[]) => p.setDiversity(v)} />
      </label>
      <label className="flex items-center justify-between gap-2">
        min relevance <span className="tabular-nums text-[var(--foreground)]">{p.minRelevance.toFixed(2)}</span>
        <Slider value={[p.minRelevance]} min={0} max={0.6} step={0.05} onValueChange={([v]: number[]) => p.setMinRelevance(v)} />
      </label>
      <label className="flex items-center justify-between gap-2" title="Keep mining until this many relevant results (or a plateau / the round budget).">
        target results <span className="tabular-nums text-[var(--foreground)]">{p.targetResults}</span>
        <Slider value={[p.targetResults]} min={10} max={60} step={5} onValueChange={([v]: number[]) => p.setTargetResults(v)} />
      </label>
      <label className="flex items-center justify-between gap-2" title="Budget: more rounds = more thorough, more Firecrawl calls.">
        max rounds <span className="tabular-nums text-[var(--foreground)]">{p.maxRounds}</span>
        <Slider value={[p.maxRounds]} min={1} max={6} step={1} onValueChange={([v]: number[]) => p.setMaxRounds(v)} />
      </label>
      <label className="flex items-center justify-between gap-2">
        categories
        <span className="flex gap-1">
          {CATEGORIES.map((c) => (
            <Chip key={c} on={p.categories.includes(c)} onClick={() => p.toggle(p.categories, p.setCategories, c)}>{c}</Chip>
          ))}
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 sm:col-span-2">
        niche domains
        <input value={p.domainsText} onChange={(e: any) => p.setDomainsText(e.target.value)} placeholder="trade.com, regional.org" className="h-8 flex-1 rounded-md border bg-[var(--surface-2)] px-2 text-xs outline-none focus:border-[var(--primary)]" />
      </label>
      <span className="flex items-center gap-2" title="Fetch full content per result (slower). Required for maxAge to apply.">
        content
        <Switch checked={p.scrapeContent} onCheckedChange={p.setScrapeContent} />
        {p.scrapeContent && (
          <select value={p.maxAge} onChange={(e: any) => p.setMaxAge(Number(e.target.value))} title="maxAge — cached-content freshness">
            <option value={172800000}>cache 2d</option>
            <option value={3600000}>cache 1h</option>
            <option value={0}>no cache</option>
          </select>
        )}
      </span>
      <span
        className="flex items-center gap-2"
        title={p.ai.allowed ? `Sharper expansion + entity probes via ${PROVIDER_LABEL[p.ai.provider] ?? p.ai.provider}` : p.ai.reason}
      >
        <Sparkles className={cn("h-4 w-4", p.ai.allowed && p.useAI ? "text-[var(--primary)]" : "text-[var(--muted)]")} />
        AI{p.ai.allowed && p.ai.provider ? ` · ${PROVIDER_LABEL[p.ai.provider] ?? p.ai.provider}` : ""}
        <Switch checked={p.ai.allowed && p.useAI} disabled={!p.ai.allowed} onCheckedChange={p.setUseAI} />
      </span>
    </div>
  );
}

/** Plain-language value summary: completeness, dedup, diversity — always visible. */
function CoverageStrip({ trace, onInspect, inspecting }: { trace: SearchTrace; onInspect: () => void; inspecting: boolean }) {
  const c = trace.coverage;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
      <span><strong className="text-[var(--foreground)]">{trace.results.length}</strong> results</span>
      <span>· <strong className="text-[var(--foreground)]">{c.uniqueDomains}</strong> distinct domains</span>
      <span>· from <strong className="text-[var(--foreground)]">{c.candidatesFound}</strong> candidates gathered</span>
      {c.duplicatesCollapsed > 0 && <span>· <strong className="text-[var(--foreground)]">{c.duplicatesCollapsed}</strong> duplicate(s) merged</span>}
      {(trace.rounds?.length ?? 0) > 0 && (
        <span>· <strong className="text-[var(--foreground)]">{trace.rounds.length}</strong> probe round(s), stopped: {trace.stopReason}</span>
      )}
      <button onClick={onInspect} className={cn("ml-auto rounded-full border px-3 py-0.5", inspecting && "border-[var(--primary)] text-[var(--foreground)]")}>
        {inspecting ? "hide" : "how it works"}
      </button>
    </div>
  );
}

/** The deep observability — pipeline funnel + hints — on demand. Tolerant of older
 *  saved-session shapes (fields may be missing on sessions written by past versions). */
function Inspect({ trace }: { trace: SearchTrace }) {
  const stages = trace.stages ?? [];
  const rounds = trace.rounds ?? [];
  const hints = trace.hints ?? [];
  const max = Math.max(...stages.map((s) => Math.max(s.countIn, s.countOut)), 1);
  return (
    <div className="mb-5 rounded-xl border bg-[var(--surface)] p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Pipeline</div>
      {stages.map((s) => (
        <div key={s.name} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs" title={s.note}>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate">{s.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-[var(--surface-2)]">
              <span className="block h-full bg-[var(--primary)]" style={{ width: pct(s.countOut / max) }} />
            </span>
          </div>
          <span className="tabular-nums text-[var(--muted)]">{s.countIn}→{s.countOut} · {s.ms}ms</span>
        </div>
      ))}
      {/* Decomposition: how coverage grew probe by probe. */}
      {rounds.length > 0 && (
        <>
          <div className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Coverage by probe{trace.stopReason ? ` — stopped: ${trace.stopReason}` : ""}
          </div>
          <div className="space-y-1">
            {rounds.map((r) => {
              const queries = r.queries ?? [];
              return (
                <div key={r.round} className="text-xs" title={queries.join(" · ")}>
                  <span className="mr-2 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--muted)]">{r.kind ?? "probe"}</span>
                  <span className="text-[var(--green)]">+{r.newRelevantDomains ?? 0}</span> new domains
                  <span className="text-[var(--muted)]"> ({r.relevantSoFar ?? 0} relevant total){queries.length ? ` · ${queries.length} ${r.kind === "entity" ? "entities" : "facets"}` : ""}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {hints.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {hints.map((h, i) => (
            <div key={i} className="rounded-md border-l-2 border-[var(--primary)] bg-[var(--surface-2)] px-3 py-1.5 text-xs">{h}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function exportTrace(trace: SearchTrace) {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `searchtrace-${trace.query.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function Results({ trace, flash }: { trace: SearchTrace; flash: number | null }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button size="sm" variant="ghost" onClick={() => exportTrace(trace)}>Export JSON</Button>
      </div>
      <div className="space-y-3">
        {trace.results.map((r) => (
          <HoloCard key={r.canonicalUrl} className={cn("scroll-mt-20", flash === r.finalRank && "ring-2 ring-[var(--primary)]")}>
            <div id={`result-${r.finalRank}`} />
            <div className="flex items-start justify-between gap-3">
              <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 font-semibold hover:text-[var(--primary)]">
                <span className="mr-1.5 text-[var(--muted)]">{r.finalRank}.</span>
                {r.title || r.url}
              </a>
              <Badge className="shrink-0" style={{ color: relColor(r.relevance), borderColor: relColor(r.relevance) }}>
                {pct(r.relevance)}
              </Badge>
            </div>
            <div className="mt-1 break-all text-xs text-[var(--blue)]">{r.domain}</div>
            {/* The "why" is here for anyone who wants it — but folded away by default. */}
            <Why c={r} />
          </HoloCard>
        ))}
      </div>
    </div>
  );
}

/** Per-result "why it's here" — collapsed by default (native <details>, no state). */
function Why({ c }: { c: Candidate }) {
  const lists = [...new Set(c.appearances.map((a) => a.list))];
  const queries = [...new Set(c.appearances.map((a) => a.query))];
  return (
    <details className="mt-2 text-xs text-[var(--muted)]">
      <summary className="cursor-pointer select-none">why this result</summary>
      <div className="mt-2 space-y-2">
        <div>
          Surfaced by {queries.length > 1 ? `${queries.length} query variants` : "the query"} across{" "}
          {lists.length} list(s){c.duplicatesOf.length ? `, merged ${c.duplicatesOf.length} duplicate(s)` : ""}.
        </div>
        {c.signals && (
          <div className="flex gap-4">
            {[
              { label: "keyword (BM25)", v: c.signals.bm25, color: "var(--amber)" },
              { label: "source agreement", v: c.signals.consensus, color: "var(--green)" },
            ].map((b) => (
              <div key={b.label} className="flex-1">
                <div className="mb-1 flex justify-between text-[10px]"><span>{b.label}</span><span>{b.v == null ? "—" : b.v.toFixed(2)}</span></div>
                <div className="h-1 overflow-hidden rounded bg-[var(--surface-2)]"><div className="h-full" style={{ width: pct(b.v ?? 0), background: b.color }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

// --- error explainer (kept: a failure should say *why*) ---
function searchErrorKind(msg: string): string {
  if (/\b429\b|rate limit/i.test(msg)) return "rate_limit";
  if (/timeout|timed out/i.test(msg)) return "timeout";
  if (/401|unauthorized|api key/i.test(msg)) return "auth";
  if (/network|fetch failed|ENOTFOUND|ECONN/i.test(msg)) return "network";
  return "error";
}
function searchErrorHint(msg: string): string {
  switch (searchErrorKind(msg)) {
    case "rate_limit": return "Rate limited — wait a few seconds and retry, or use the fast depth.";
    case "timeout": return "Took too long — try fast depth or fewer sources.";
    case "auth": return "Check FIRECRAWL_API_KEY in your .env.";
    case "network": return "Couldn't reach Firecrawl — check your connection.";
    default: return "Unexpected error. The message above is the raw cause.";
  }
}
