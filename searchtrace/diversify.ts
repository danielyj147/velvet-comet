import type { Candidate, Semantics } from "./types.js";
import { tokenize, jaccard } from "./text.js";
import { cosine } from "./embeddings.js";

/**
 * Maximal Marginal Relevance (MMR). Build the final list greedily, each pick
 * scored as  (1−d)·relevance − d·maxSimilarityToAlreadyPicked, where d is the
 * requested diversity. Turning d up trades a little relevance for a lot of
 * spread — the algorithmic answer to "stop giving me forty of the same SEO
 * winner" (#1). Similarity weights same-domain heavily, so domain variety (the
 * thing the analyst actually wants) is what gets rewarded.
 */

/** Content similarity for MMR: cosine when vectors exist, lexical otherwise. */
function contentSim(a: Candidate, aTok: Set<string>, b: Candidate, bTok: Set<string>, semantics?: Semantics): number {
  const av = semantics?.vectorOf(a.canonicalUrl);
  const bv = semantics?.vectorOf(b.canonicalUrl);
  return av && bv ? Math.max(0, cosine(av, bv)) : jaccard(aTok, bTok);
}

/** MMR similarity: strong same-domain signal, plus content similarity. */
function similarity(a: Candidate, aTok: Set<string>, b: Candidate, bTok: Set<string>, semantics?: Semantics): number {
  const sameDomain = a.domain === b.domain ? 0.7 : 0;
  return Math.max(contentSim(a, aTok, b, bTok, semantics), sameDomain);
}

export function diversify(
  candidates: Candidate[],
  diversity: number,
  topK: number,
  semantics?: Semantics,
): Candidate[] {
  if (candidates.length === 0) return [];
  // Rank on relevance (the precision signal), fall back to RRF if unscored.
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
        const sim = similarity(
          cand,
          tokens.get(cand.canonicalUrl)!,
          s,
          tokens.get(s.canonicalUrl)!,
          semantics,
        );
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
