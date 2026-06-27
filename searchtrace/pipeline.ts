import {
  searchRequest,
  type SearchRequest,
  type SearchTrace,
  type StageRecord,
  type Candidate,
  type Coverage,
} from "./types.js";
import { expand, type Expander } from "./expand.js";
import { federateQuery } from "./firecrawl-search.js";
import { rrfFuse } from "./fuse.js";
import { dedup } from "./dedup.js";
import { scoreRelevance, precisionGate } from "./rerank.js";
import { diversify } from "./diversify.js";

/**
 * The retrieval pipeline, and the trace it emits:
 *   expand -> federate -> RRF fuse -> dedup -> diversify (MMR)
 * Each stage records count-in / count-out / time so the funnel is legible, and
 * every surviving result carries its provenance. This is the whole product:
 * better recall *and* a reason to trust it.
 */
export async function runSearch(
  input: SearchRequest,
  opts: { expander?: Expander } = {},
): Promise<SearchTrace> {
  const req = searchRequest.parse(input);
  const startedAt = Date.now();
  const stages: StageRecord[] = [];

  const stage = async <T>(
    name: string,
    countIn: number,
    fn: () => Promise<T> | T,
    sizeOf: (r: T) => number,
    note?: (r: T) => string,
  ): Promise<T> => {
    const t0 = Date.now();
    const result = await fn();
    stages.push({
      name,
      countIn,
      countOut: sizeOf(result),
      ms: Date.now() - t0,
      note: note?.(result),
    });
    return result;
  };

  // 1. Expand the query (wider, not just deeper).
  const expansions = await stage(
    "expand",
    1,
    () => expand(req.query, req.tier, opts.expander),
    (e) => e.length,
    (e) => `${e.length} query variant(s)`,
  );

  // 2. Federate each expansion across sources, categories, and niche domains.
  const lists = await stage(
    "federate",
    expansions.length,
    async () => {
      const perQuery = await Promise.all(
        expansions.map((q) =>
          federateQuery(q, {
            sources: req.sources,
            categories: req.categories,
            nicheDomains: req.nicheDomains,
            limit: req.limit,
          }),
        ),
      );
      return perQuery.flat();
    },
    (l) => l.length,
    (l) => `${l.length} ranked lists, ${l.reduce((n, x) => n + x.items.length, 0)} raw hits`,
  );

  const candidatesFound = lists.reduce((n, l) => n + l.items.length, 0);

  // 3. RRF fuse all lists into one ranked candidate set.
  const fused = await stage(
    "fuse (RRF)",
    candidatesFound,
    () => rrfFuse(lists),
    (c) => c.length,
    (c) => `${c.length} unique URLs after canonicalization`,
  );

  // 4. Collapse content near-duplicates (syndication).
  const deduped = await stage(
    "dedup",
    fused.length,
    () => dedup(fused),
    (c) => c.length,
    (c) => `${fused.length - c.length} near-duplicate(s) collapsed`,
  );

  // 5. Score relevance to the original query (precision signal for ranking).
  const scored = await stage(
    "rerank (relevance)",
    deduped.length,
    () => scoreRelevance(req.query, deduped),
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
    () => diversify(gated, req.diversity, req.topK),
    (c) => c.length,
    (c) => `${c.length} results, diversity=${req.diversity}`,
  );

  const endedAt = Date.now();
  const coverage = computeCoverage(candidatesFound, fused, deduped, results, droppedLowRelevance);
  const hints = buildHints(results, coverage, req.diversity);

  return {
    query: req.query,
    tier: req.tier,
    expansions,
    lists: [...new Set(lists.map((l) => l.list))],
    stages,
    coverage,
    results,
    startedAt,
    endedAt,
    hints,
  };
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
