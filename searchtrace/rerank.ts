import type { Candidate } from "./types.js";
import { tokenize, jaccard } from "./text.js";

/**
 * Relevance scoring (the precision stage) and the precision gate.
 *
 * Recall is won upstream by expansion + federation; the risk is that breadth
 * drags in off-topic results, hurting precision. So we score every candidate's
 * relevance to the ORIGINAL query (not the expansions) and (a) rank on it in MMR,
 * (b) optionally drop the long tail of low-relevance hits.
 *
 * Relevance blends two signals so neither alone can mislead:
 *   - consensus: normalized RRF — how many federated lists agreed (catches
 *     semantically-relevant pages whose wording differs from the query)
 *   - lexical:   query-term coverage in title+description (catches on-topic pages
 *     that happened to appear in only one list)
 * A high-consensus page with zero lexical overlap still scores well; a one-list
 * page with no query terms scores low and is gated out.
 *
 * This blend is the exact seam for a cross-encoder reranker (bge-reranker, Cohere
 * Rerank, or a local transformers.js MiniLM): replace `lexical` with the model's
 * (query, doc) score for a large precision gain, gated to the top-k for cost.
 */
const CONSENSUS_WEIGHT = 0.6;
const LEXICAL_WEIGHT = 0.4;

export function scoreRelevance(query: string, candidates: Candidate[]): Candidate[] {
  if (candidates.length === 0) return candidates;
  const queryTok = tokenize(query);
  const maxRrf = Math.max(...candidates.map((c) => c.rrfScore)) || 1;

  for (const c of candidates) {
    const consensus = c.rrfScore / maxRrf;
    const lexical = jaccard(queryTok, tokenize(`${c.title} ${c.description}`));
    c.relevance = CONSENSUS_WEIGHT * consensus + LEXICAL_WEIGHT * lexical;
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
