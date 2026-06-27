import { z } from "zod";

/**
 * searchtrace — a controllable, observable retrieval layer over Firecrawl
 * `/v2/search`. The trace is the product: every result carries *why* it surfaced,
 * and every pipeline stage reports what it did. This schema is shared by the
 * pipeline (Node) and the trace viewer.
 *
 * Pipeline: expand -> federate -> RRF fuse -> dedup -> rerank* -> MMR diversify.
 * (*rerank lands in a later iteration; the shape already leaves room for it.)
 */

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** Latency/quality tiers — the explicit dial that serves both the "just give me
 *  3 fast snippets" ask (#4) and the "completeness, 10x slower is fine" ask (#1). */
export const tier = z.enum(["fast", "balanced", "thorough"]);
export type Tier = z.infer<typeof tier>;

export const searchSource = z.enum(["web", "news"]);
export type SearchSource = z.infer<typeof searchSource>;

/** Result recency → Firecrawl `tbs` time filter. */
export const recency = z.enum(["any", "day", "week", "month", "year"]);
export type Recency = z.infer<typeof recency>;

export const searchRequest = z.object({
  query: z.string().min(1),
  tier: tier.default("balanced"),
  /** Sources to federate across. */
  sources: z.array(searchSource).default(["web"]),
  /** Firecrawl categories (e.g. research, github) to add as extra federated lists. */
  categories: z.array(z.string()).default([]),
  /** Niche domains the customer keeps finding by hand — searched explicitly so the
   *  long tail enters the candidate pool (the core of the completeness fix). */
  nicheDomains: z.array(z.string()).default([]),
  /** Per-list result limit. */
  limit: z.number().int().positive().max(50).default(10),
  /** Result recency → `tbs` time filter (e.g. only the past week). */
  recency: recency.default("any"),
  /** Fetch full content per result (slower, costs credits) — required for maxAge to
   *  apply and for richer ranking. Off = fast snippets only. */
  scrapeContent: z.boolean().default(false),
  /** Max age of cached content, ms (only used when scrapeContent is on). Firecrawl's
   *  default is 2 days (172800000); 0 forces fresh. This is cache freshness — a
   *  *scrape* param — distinct from `recency` (result age). */
  maxAge: z.number().int().nonnegative().default(172800000),
  /** MMR tradeoff: 0.0 = pure relevance, 1.0 = maximum diversity. */
  diversity: z.number().min(0).max(1).default(0.3),
  /** Precision gate: drop candidates whose relevance to the ORIGINAL query is
   *  below this (0 = keep all). Recall is won by expansion/federation; precision
   *  is protected here so breadth doesn't drag in off-topic results. */
  minRelevance: z.number().min(0).max(1).default(0),
  /** Final result count after diversification. */
  topK: z.number().int().positive().default(20),
});
export type SearchRequest = z.infer<typeof searchRequest>;
/** Input shape (defaults optional) — what callers pass before `.parse()`. */
export type SearchRequestInput = z.input<typeof searchRequest>;

// ---------------------------------------------------------------------------
// Candidates & provenance
// ---------------------------------------------------------------------------

/** One appearance of a URL in one federated list — the atom of provenance. */
export interface Appearance {
  /** The (expanded) query that produced this list. */
  query: string;
  /** "web" | "news" | "category:research" | "domain:example.com" */
  list: string;
  /** 1-based rank within that list (Firecrawl's `position`). */
  position: number;
}

export interface Candidate {
  url: string;
  /** Canonicalized URL used as the dedup key. */
  canonicalUrl: string;
  domain: string;
  title: string;
  description: string;
  /** Every list this URL (or a near-duplicate of it) showed up in. */
  appearances: Appearance[];
  /** Canonical URLs of near-duplicates collapsed into this candidate. */
  duplicatesOf: string[];
  /** Reciprocal-rank-fusion score (set by the fuse stage) — the recall/consensus
   *  signal: how many lists agreed on this result. */
  rrfScore: number;
  /** Relevance to the ORIGINAL query, 0..1 (set by the rerank stage) — the
   *  precision signal. MMR ranks on this; the precision gate filters on it. */
  relevance: number;
  /** Per-signal breakdown behind `relevance`, each normalized 0..1, for the UI.
   *  dense is null when no embedder was available. */
  signals?: { bm25: number; dense: number | null; consensus: number };
  /** Whether MMR kept this in the final, diversified list. */
  selected: boolean;
  /** 1-based final rank after diversification (only for selected). */
  finalRank?: number;
  /** Human one-liner: why this result is where it is. */
  why?: string;
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

/** Optional semantic context: query vector + per-candidate vectors. When present,
 *  the dedup/rerank/diversify stages use cosine similarity instead of lexical. */
export interface Semantics {
  model: string;
  queryVec?: number[];
  vectorOf(canonicalUrl: string): number[] | undefined;
}

export interface StageRecord {
  name: string;
  countIn: number;
  countOut: number;
  ms: number;
  /** Short, glanceable note ("8 queries x 2 sources = 16 lists"). */
  note?: string;
}

export interface Coverage {
  candidatesFound: number;
  uniqueAfterDedup: number;
  duplicatesCollapsed: number;
  /** Candidates dropped by the precision gate (below minRelevance). */
  droppedLowRelevance: number;
  uniqueDomains: number;
  /** Mean relevance of the FINAL results, 0..1 — the precision readout. */
  meanRelevance: number;
  /** Share of final results per source/list, for the coverage panel. */
  listDistribution: Record<string, number>;
  /** Domain distribution of the final results (concentration check). */
  domainDistribution: Record<string, number>;
  /** Shannon entropy over final-result domains, normalized 0..1 — a single
   *  "how spread out are these sources" number for the UI. */
  diversityIndex: number;
}

export interface SearchTrace {
  query: string;
  tier: Tier;
  expansions: string[];
  lists: string[];
  stages: StageRecord[];
  coverage: Coverage;
  results: Candidate[];
  startedAt: number;
  endedAt: number;
  /** Plain-language nudges: "28 of 30 results are from 4 domains — raise diversity?" */
  hints: string[];
}
