import type { Candidate } from "./types.js";
import { termList } from "./text.js";
import { buildBm25 } from "./bm25.js";

/**
 * Hybrid relevance scoring (the precision stage) + the precision gate.
 *
 * Recall is won upstream by expansion + federation; here we decide how *relevant*
 * each candidate is to the ORIGINAL query, fusing two complementary signals:
 *   - bm25:      in-memory lexical match over the candidate pool (exact terms)
 *   - consensus: the RRF score from fusing Firecrawl's own returned lists
 *
 * Each signal ranks the pool; we fuse the *ranks* with Reciprocal Rank Fusion so
 * incomparable score scales don't fight. The fused score becomes `relevance`; MMR
 * ranks on it and the gate filters on it. (Kept deliberately lexical — no embeddings
 * — so it's fast and scales to a nightly batch of thousands of queries.)
 */
const RRF_K = 60;

function rankMap(candidates: Candidate[], scoreOf: (c: Candidate) => number): Map<string, number> {
  const ranked = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));
  const m = new Map<string, number>();
  ranked.forEach((c, i) => m.set(c.canonicalUrl, i + 1));
  return m;
}

/** Min–max normalize a score into 0..1 for display. */
function normalizer(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return (v) => (span > 0 ? (v - min) / span : 0);
}

export function scoreRelevance(query: string, candidates: Candidate[]): Candidate[] {
  if (candidates.length === 0) return candidates;

  const queryTerms = termList(query);
  const bm25 = buildBm25(candidates.map((c) => `${c.title} ${c.description}`));

  // Raw per-signal scores. BM25 is indexed by the doc's position in the pool.
  const indexOf = new Map(candidates.map((c, i) => [c.canonicalUrl, i]));
  const bm25Score = (c: Candidate) => bm25.score(queryTerms, indexOf.get(c.canonicalUrl)!);

  // Rank each signal across the pool.
  const bm25Ranks = rankMap(candidates, bm25Score);
  const consensusRanks = rankMap(candidates, (c) => c.rrfScore);

  // Normalizers for the displayed signal breakdown.
  const nBm = normalizer(candidates.map(bm25Score));
  const nCons = normalizer(candidates.map((c) => c.rrfScore));

  // Fuse the ranks (RRF) into the final relevance, then normalize 0..1.
  const rrf = (url: string) => 1 / (RRF_K + bm25Ranks.get(url)!) + 1 / (RRF_K + consensusRanks.get(url)!);
  const fused = new Map(candidates.map((c) => [c.canonicalUrl, rrf(c.canonicalUrl)]));
  const nFused = normalizer([...fused.values()]);

  for (const c of candidates) {
    c.relevance = nFused(fused.get(c.canonicalUrl)!);
    c.signals = { bm25: nBm(bm25Score(c)), consensus: nCons(c.rrfScore) };
  }
  return candidates.sort((a, b) => b.relevance - a.relevance);
}

/** Drop candidates below the precision threshold. Returns kept + dropped count. */
export function precisionGate(
  candidates: Candidate[],
  minRelevance: number,
): { kept: Candidate[]; dropped: number } {
  if (minRelevance <= 0) return { kept: candidates, dropped: 0 };
  const kept = candidates.filter((c) => c.relevance >= minRelevance);
  return { kept, dropped: candidates.length - kept.length };
}
