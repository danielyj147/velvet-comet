import {
  searchRequest,
  type SearchRequestInput,
  type SearchTrace,
  type StageRecord,
  type Candidate,
  type Coverage,
  type Semantics,
} from "./types.js";
import { expand, heuristicExpander, type Expander } from "./expand.js";
import { federateQuery, type RankedList, type RawItem } from "./firecrawl-search.js";
import { termList, tokenize, jaccard, domainOf, canonicalizeUrl } from "./text.js";
import { rrfFuse } from "./fuse.js";
import { dedup } from "./dedup.js";
import { scoreRelevance, precisionGate } from "./rerank.js";
import { diversify } from "./diversify.js";
import { getEmbedder } from "./embeddings.js";
import type { Recency } from "./types.js";
import { log } from "./log.js";

/** A result counts as "relevant" if its absolute lexical overlap with the original
 *  query clears this floor — cheap and stable across rounds (unlike pool-normalized
 *  relevance). It's only the loop's stop signal; final ranking uses the hybrid score. */
const RELEVANCE_FLOOR = 0.1;
/** Stop mining when a round adds fewer than this many new relevant domains. */
const PLATEAU_K = 2;

/** Result-recency (`recency`) maps to Firecrawl's `tbs` time filter. */
const TBS: Record<Recency, string | undefined> = {
  any: undefined,
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

/**
 * The retrieval pipeline, and the trace it emits:
 *   expand → [adaptive mining loop] → RRF fuse → embed → dedup → rerank → gate → MMR
 * Completeness is won by the loop: each round searches a query variant while excluding
 * the domains already seen, so new sources surface instead of "more of the same"; it
 * stops at the target, a plateau, or the round budget. Precision is the relevance
 * floor (loop) + rerank/gate (final); diversity is MMR. Each stage self-reports
 * count-in / count-out / time, so the funnel — and how complete it got — is legible.
 */
export async function runSearch(
  input: SearchRequestInput,
  opts: { expander?: Expander; useModels?: boolean } = {},
): Promise<SearchTrace> {
  const req = searchRequest.parse(input);
  // AI (embeddings + LLM expansion) is on by default for the CLI; the web app passes
  // this explicitly from the user's toggle (gated by server config). When off, we
  // skip the embed stage and force the deterministic heuristic expander.
  const useModels = opts.useModels ?? true;
  const startedAt = Date.now();
  const stages: StageRecord[] = [];
  log("search.start", { query: req.query, tier: req.tier, diversity: req.diversity, ai: useModels });

  // Wrap each stage so it self-reports to the trace (count in/out, timing, a note)
  // and logs its latency. Keeping this one helper is why every stage below stays a
  // single declarative call — and why timing is captured uniformly everywhere.
  const stage = async <T>(
    name: string,
    countIn: number,
    fn: () => Promise<T> | T,
    sizeOf: (r: T) => number,
    note?: (r: T) => string,
  ): Promise<T> => {
    const t0 = Date.now();
    const result = await fn();
    const ms = Date.now() - t0;
    const countOut = sizeOf(result);
    stages.push({ name, countIn, countOut, ms, note: note?.(result) });
    log("stage", { name, ms, in: countIn, out: countOut });
    return result;
  };

  const tbs = TBS[req.recency];

  // 1. Expand the query (wider, not just deeper).
  const expander = opts.expander ?? (useModels ? undefined : heuristicExpander);
  const expansions = await stage(
    "expand",
    1,
    () => expand(req.query, req.tier, expander),
    (e) => e.length,
    (e) => `${e.length} query variant(s)`,
  );

  // 2. Adaptive completeness mining. Each round searches a query variant while
  //    EXCLUDING every domain seen so far, so new domains surface instead of "forty
  //    more of the same SEO winners". We stop when we have enough *relevant* results,
  //    when a round stops adding new relevant domains (the tail is exhausted), or when
  //    the round budget runs out. "Relevant" = an absolute lexical match to the
  //    ORIGINAL query (cheap + stable across rounds); the expensive hybrid ranking
  //    runs once at the end.
  const queryTerms = new Set(termList(req.query));
  const isRelevant = (it: RawItem) =>
    jaccard(queryTerms, tokenize(`${it.title} ${it.description}`)) >= RELEVANCE_FLOOR;

  const lists: RankedList[] = [];
  const seenDomains = new Set<string>();
  const relevantUrls = new Set<string>();
  const rounds: SearchTrace["rounds"] = [];
  let stopReason: SearchTrace["stopReason"] = "budget";

  for (let round = 1; round <= req.maxRounds; round++) {
    const q = expansions[Math.min(round - 1, expansions.length - 1)]!;
    const excludeDomains = round === 1 ? [] : [...seenDomains];
    const roundLists = await stage(
      `mine round ${round}`,
      seenDomains.size,
      () =>
        federateQuery(q, {
          sources: req.sources,
          categories: req.categories,
          nicheDomains: round === 1 ? req.nicheDomains : [], // explicit niche domains once
          excludeDomains,
          limit: req.limit,
          tbs,
          contentMaxAge: req.scrapeContent ? req.maxAge : undefined,
        }),
      (ls) => ls.reduce((n, l) => n + l.items.length, 0),
      () => `"${q}"${round > 1 ? ` · excluding ${seenDomains.size} seen domains` : ""}`,
    );
    lists.push(...roundLists);

    // Count NEW relevant domains this round, then mark every domain seen (so the
    // next round excludes it — relevant or not, we don't want it again).
    let newRelevantDomains = 0;
    for (const l of roundLists)
      for (const it of l.items) {
        const d = domainOf(it.url);
        const rel = isRelevant(it);
        if (rel) relevantUrls.add(canonicalizeUrl(it.url));
        if (rel && !seenDomains.has(d)) newRelevantDomains++;
      }
    for (const l of roundLists) for (const it of l.items) seenDomains.add(domainOf(it.url));

    rounds.push({ round, query: q, newRelevantDomains, relevantSoFar: relevantUrls.size });

    if (relevantUrls.size >= req.targetResults) { stopReason = "target reached"; break; }
    if (round > 1 && newRelevantDomains < PLATEAU_K) { stopReason = "plateau"; break; }
  }

  const candidatesFound = lists.reduce((n, l) => n + l.items.length, 0);

  // 3. RRF fuse all lists into one ranked candidate set.
  const fused = await stage(
    "fuse (RRF)",
    candidatesFound,
    () => rrfFuse(lists),
    (c) => c.length,
    (c) => `${c.length} unique URLs after canonicalization`,
  );

  // 3b. Embed query + candidates (semantic upgrade for the stages below) — only
  //     when AI is on. Falls back to lexical automatically if Ollama isn't running.
  const semantics = useModels
    ? await stage(
        "embed",
        fused.length,
        () => embedCandidates(req.query, fused),
        (s) => (s ? fused.length : 0),
        (s) => (s ? `vectors via ${s.model}` : "lexical fallback (no embedder)"),
      )
    : null;

  // 4. Collapse content near-duplicates (syndication; semantic when embedded).
  const deduped = await stage(
    "dedup",
    fused.length,
    () => dedup(fused, semantics ?? undefined),
    (c) => c.length,
    (c) => `${fused.length - c.length} near-duplicate(s) collapsed`,
  );

  // 5. Score relevance to the original query (precision signal for ranking).
  const scored = await stage(
    "rerank (relevance)",
    deduped.length,
    () => scoreRelevance(req.query, deduped, semantics ?? undefined),
    (c) => c.length,
    (c) => `mean relevance ${mean(c.map((x) => x.relevance)).toFixed(2)}`,
  );

  // 6. Precision gate: drop the low-relevance long tail (opt-in via minRelevance).
  let droppedLowRelevance = 0;
  const gated = await stage(
    "precision gate",
    scored.length,
    () => {
      const { kept, dropped } = precisionGate(scored, req.minRelevance);
      droppedLowRelevance = dropped;
      return kept;
    },
    (c) => c.length,
    () => `dropped ${droppedLowRelevance} below minRelevance=${req.minRelevance}`,
  );

  // 7. Diversify with MMR down to topK (ranks on relevance, spreads by domain).
  const results = await stage(
    "diversify (MMR)",
    gated.length,
    () => diversify(gated, req.diversity, req.topK, semantics ?? undefined),
    (c) => c.length,
    (c) => `${c.length} results, diversity=${req.diversity}`,
  );

  const endedAt = Date.now();
  const coverage = computeCoverage(candidatesFound, fused, deduped, results, droppedLowRelevance);
  const hints = buildHints(results, coverage, req.diversity);

  log("search.timing", Object.fromEntries(stages.map((s) => [s.name.replace(/\W+/g, "_"), s.ms])));
  log("search.done", {
    ms: endedAt - startedAt,
    results: results.length,
    domains: coverage.uniqueDomains,
    meanRelevance: Number(coverage.meanRelevance.toFixed(3)),
    semantic: !!semantics,
  });

  return {
    query: req.query,
    tier: req.tier,
    expansions,
    lists: [...new Set(lists.map((l) => l.list))],
    rounds,
    stopReason,
    stages,
    coverage,
    results,
    startedAt,
    endedAt,
    hints,
  };
}

/** Embed the query and every candidate once; return a Semantics lookup, or null
 *  if no embedder is available (stages then use their lexical fallback). */
async function embedCandidates(query: string, candidates: Candidate[]): Promise<Semantics | null> {
  const embedder = await getEmbedder();
  if (!embedder || candidates.length === 0) return null;
  try {
    const texts = candidates.map((c) => `${c.title}. ${c.description}`.slice(0, 2000));
    const [queryVec, ...vecs] = await embedder.embed([query, ...texts]);
    const byUrl = new Map<string, number[]>();
    candidates.forEach((c, i) => byUrl.set(c.canonicalUrl, vecs[i]!));
    return {
      model: embedder.model,
      queryVec,
      vectorOf: (url) => byUrl.get(url),
    };
  } catch (err) {
    console.warn("[embeddings] embedding failed; lexical fallback:", (err as Error).message);
    return null;
  }
}

function computeCoverage(
  candidatesFound: number,
  fused: Candidate[],
  deduped: Candidate[],
  results: Candidate[],
  droppedLowRelevance: number,
): Coverage {
  const listDistribution: Record<string, number> = {};
  const domainDistribution: Record<string, number> = {};
  for (const r of results) {
    domainDistribution[r.domain] = (domainDistribution[r.domain] ?? 0) + 1;
    for (const list of new Set(r.appearances.map((a) => a.list))) {
      listDistribution[list] = (listDistribution[list] ?? 0) + 1;
    }
  }
  return {
    candidatesFound,
    uniqueAfterDedup: deduped.length,
    duplicatesCollapsed: fused.length - deduped.length,
    droppedLowRelevance,
    uniqueDomains: new Set(results.map((r) => r.domain)).size,
    meanRelevance: mean(results.map((r) => r.relevance)),
    listDistribution,
    domainDistribution,
    diversityIndex: normalizedEntropy(Object.values(domainDistribution)),
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Shannon entropy of the domain distribution, normalized to 0..1 — a single
 *  "how spread out are the sources" number (1 = every result a different domain). */
function normalizedEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 1 || counts.length <= 1) return counts.length <= 1 ? 0 : 1;
  let h = 0;
  for (const c of counts) {
    const p = c / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h / Math.log2(counts.length);
}

/** Plain-language nudges — the "what should I do" half of the UI. */
function buildHints(results: Candidate[], coverage: Coverage, diversity: number): string[] {
  const hints: string[] = [];
  if (results.length === 0) {
    hints.push("No results. Broaden the query, add sources, or raise the per-list limit.");
    return hints;
  }
  const topDomains = Object.entries(coverage.domainDistribution).sort((a, b) => b[1] - a[1]);
  const top = topDomains[0];
  if (top && top[1] / results.length > 0.4 && diversity < 0.6) {
    hints.push(
      `${top[1]} of ${results.length} results are from ${top[0]} — raise diversity to spread sources.`,
    );
  }
  if (coverage.diversityIndex > 0.85) {
    hints.push(`High source diversity (${coverage.diversityIndex.toFixed(2)}): ${coverage.uniqueDomains} distinct domains.`);
  }
  if (coverage.duplicatesCollapsed > 0) {
    hints.push(`${coverage.duplicatesCollapsed} syndicated duplicate(s) collapsed — completeness without repetition.`);
  }
  return hints;
}
