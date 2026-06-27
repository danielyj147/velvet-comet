"use client";

import * as React from "react";
import { useCommandRegister, type Cmd } from "../command/CommandProvider";
import type { SearchTrace, Tier } from "../../searchtrace/types";

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
    const el = document.getElementById(`result-${rank}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(rank);
    setTimeout(() => setFlash(null), 1500);
  }, []);

  // Register Cmd+K commands: jump to any result, plus quick toggles + actions.
  const commands = React.useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [];
    for (const r of trace?.results ?? []) {
      cmds.push({
        id: `result-${r.finalRank}`,
        group: "Results",
        label: r.title || r.url,
        hint: r.domain,
        keywords: `${r.domain} ${r.url}`,
        perform: () => jumpTo(r.finalRank!),
      });
    }
    for (const t of TIERS)
      cmds.push({ id: `tier-${t}`, group: "Settings", label: `Tier: ${t}`, hint: tier === t ? "current" : "", perform: () => setTier(t) });
    for (const s of SOURCES)
      cmds.push({ id: `src-${s}`, group: "Settings", label: `Toggle source: ${s}`, hint: sources.includes(s) ? "on" : "off", perform: () => toggle(sources, setSources, s) });
    for (const c of CATEGORIES)
      cmds.push({ id: `cat-${c}`, group: "Settings", label: `Toggle category: ${c}`, hint: categories.includes(c) ? "on" : "off", perform: () => toggle(categories, setCategories, c) });
    for (const d of [0, 0.3, 0.6, 0.9])
      cmds.push({ id: `div-${d}`, group: "Settings", label: `Diversity: ${d}`, hint: diversity === d ? "current" : "", perform: () => setDiversity(d) });
    for (const m of [0, 0.2, 0.35])
      cmds.push({ id: `minrel-${m}`, group: "Settings", label: `Min relevance: ${m}`, hint: minRelevance === m ? "current" : "", perform: () => setMinRelevance(m) });
    cmds.push({ id: "act-run", group: "Actions", label: "Run search", perform: () => void run() });
    cmds.push({ id: "act-focus", group: "Actions", label: "Focus query box", perform: () => inputRef.current?.focus() });
    return cmds;
  }, [trace, tier, sources, categories, diversity, minRelevance, run, jumpTo]);

  useCommandRegister(commands, [commands]);

  return (
    <main className="page">
      <div className="searchbar">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search the web with full recall + precision…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button onClick={run} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      <div className="controls">
        <label>
          tier
          <select value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          diversity {diversity}
          <input type="range" min={0} max={1} step={0.1} value={diversity} onChange={(e) => setDiversity(Number(e.target.value))} />
        </label>
        <label>
          min relevance {minRelevance}
          <input type="range" min={0} max={0.6} step={0.05} value={minRelevance} onChange={(e) => setMinRelevance(Number(e.target.value))} />
        </label>
        <span>
          {SOURCES.map((s) => (
            <button key={s} className={`chip ${sources.includes(s) ? "on" : ""}`} onClick={() => toggle(sources, setSources, s)}>
              {s}
            </button>
          ))}
        </span>
        <span>
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${categories.includes(c) ? "on" : ""}`} onClick={() => toggle(categories, setCategories, c)}>
              {c}
            </button>
          ))}
        </span>
        <label>
          niche domains
          <input type="text" placeholder="trade.com, regional.org" value={domainsText} onChange={(e) => setDomainsText(e.target.value)} style={{ width: 220 }} />
        </label>
      </div>

      {error && <div className="hint" style={{ borderColor: "var(--red)" }}>Error: {error}</div>}
      {!trace && !error && <div className="empty">Run a search to see the trace. Press ⌘K anytime.</div>}

      {trace && (
        <div className="split">
          <div>
            <Funnel trace={trace} />
            <Coverage trace={trace} />
            {trace.hints.length > 0 && (
              <div className="panel">
                <h3>What to do</h3>
                {trace.hints.map((h, i) => (
                  <div key={i} className="hint">{h}</div>
                ))}
              </div>
            )}
          </div>
          <Results trace={trace} flash={flash} />
        </div>
      )}
    </main>
  );
}

function Funnel({ trace }: { trace: SearchTrace }) {
  const max = Math.max(...trace.stages.map((s) => Math.max(s.countIn, s.countOut)), 1);
  return (
    <div className="panel">
      <h3>Pipeline</h3>
      {trace.stages.map((s) => (
        <div key={s.name} className="stage" title={s.note}>
          <span>{s.name}</span>
          <span className="barwrap">
            <span className="bar" style={{ width: pct(s.countOut / max) }} />
          </span>
          <span className="cnt">
            {s.countIn}→{s.countOut} · {s.ms}ms
          </span>
        </div>
      ))}
    </div>
  );
}

function Coverage({ trace }: { trace: SearchTrace }) {
  const c = trace.coverage;
  const recall = c.candidatesFound ? c.uniqueAfterDedup / c.candidatesFound : 0;
  return (
    <div className="panel">
      <h3>Coverage</h3>
      <Meter cls="recall" label="recall pool" value={recall} note={`${c.candidatesFound} hits → ${c.uniqueAfterDedup} unique`} />
      <Meter cls="precision" label="precision (mean relevance)" value={c.meanRelevance} note={c.droppedLowRelevance ? `${c.droppedLowRelevance} gated` : "no gate"} />
      <Meter cls="diversity" label="source diversity" value={c.diversityIndex} note={`${c.uniqueDomains} domains`} />
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {c.duplicatesCollapsed} duplicate(s) collapsed · lists: {trace.lists.join(", ")}
      </div>
    </div>
  );
}

function Meter({ cls, label, value, note }: { cls: string; label: string; value: number; note: string }) {
  return (
    <div className="meter">
      <div className="lab">
        <span>{label}</span>
        <span className="muted">{note}</span>
      </div>
      <div className="track">
        <div className={`fill ${cls}`} style={{ width: pct(Math.max(0, Math.min(1, value))) }} />
      </div>
    </div>
  );
}

function Results({ trace, flash }: { trace: SearchTrace; flash: number | null }) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 10 }}>
        {trace.results.length} results · expansions: {trace.expansions.map((e) => `"${e}"`).join(", ")}
      </div>
      {trace.results.map((r) => (
        <div key={r.canonicalUrl} id={`result-${r.finalRank}`} className={`result ${flash === r.finalRank ? "flash" : ""}`}>
          <div>
            <span className="rank">{r.finalRank}.</span>
            <a className="title" href={r.url} target="_blank" rel="noreferrer">
              {r.title || r.url}
            </a>
          </div>
          <div className="meta">
            <span className="relpill" style={{ color: relColor(r.relevance), borderColor: relColor(r.relevance) }}>
              rel {r.relevance.toFixed(2)}
            </span>
            <span className="domain">{r.domain}</span>
            <span>· {r.why}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
