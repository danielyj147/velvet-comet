import type { Candidate } from "./types.js";
import { tokenize, jaccard } from "./text.js";

/**
 * Maximal Marginal Relevance (MMR). Build the final list greedily, each pick
 * scored as  (1−d)·relevance − d·maxSimilarityToAlreadyPicked, where d is the
 * requested diversity. Turning d up trades a little relevance for a lot of
 * spread — the algorithmic answer to "stop giving me forty of the same SEO
 * winner" (#1). Similarity weights same-domain heavily, so domain variety (the
 * thing the analyst actually wants) is what gets rewarded.
 */

/** MMR similarity: strong same-domain signal, plus lexical content overlap. */
function similarity(a: Candidate, aTok: Set<string>, b: Candidate, bTok: Set<string>): number {
  const sameDomain = a.domain === b.domain ? 0.7 : 0;
  return Math.max(jaccard(aTok, bTok), sameDomain);
}

export function diversify(candidates: Candidate[], diversity: number, topK: number): Candidate[] {
  if (candidates.length === 0) return [];
  // Rank on relevance (the precision signal), falling back to the RRF score.
  const relevanceOf = (c: Candidate) => (c.relevance > 0 ? c.relevance : c.rrfScore);
  const maxRel = Math.max(...candidates.map(relevanceOf)) || 1;
  const tokens = new Map(candidates.map((c) => [c.canonicalUrl, tokenize(`${c.title} ${c.description}`)]));
  const rrfRank = new Map(candidates.map((c, i) => [c.canonicalUrl, i + 1]));

  const pool = [...candidates];
  const selected: Candidate[] = [];

  while (selected.length < topK && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i]!;
      const relevance = relevanceOf(cand) / maxRel;
      let maxSim = 0;
      for (const s of selected) {
        const sim = similarity(cand, tokens.get(cand.canonicalUrl)!, s, tokens.get(s.canonicalUrl)!);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = (1 - diversity) * relevance - diversity * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    const [picked] = pool.splice(bestIdx, 1);
    picked!.selected = true;
    picked!.finalRank = selected.length + 1;
    picked!.why = explain(picked!, rrfRank.get(picked!.canonicalUrl)!);
    selected.push(picked!);
  }

  return selected;
}

/** One-line, human "why this is here" for the trace. Cross-query / cross-list
 *  agreement is the completeness signal worth surfacing. */
function explain(cand: Candidate, rrfRank: number): string {
  const lists = [...new Set(cand.appearances.map((a) => a.list))];
  const queries = [...new Set(cand.appearances.map((a) => a.query))];
  const agree =
    queries.length > 1
      ? `agreed across ${queries.length} queries`
      : lists.length > 1
        ? `in ${lists.length} lists`
        : `from ${lists[0]}`;
  const dupNote = cand.duplicatesOf.length ? `, merged ${cand.duplicatesOf.length} dup` : "";
  return `RRF #${rrfRank}, ${agree}${dupNote}`;
}
