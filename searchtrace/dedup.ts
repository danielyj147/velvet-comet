import type { Candidate } from "./types.js";
import { tokenize, jaccard } from "./text.js";

/**
 * Near-duplicate collapse. RRF already merged identical canonical URLs; this stage
 * handles the *content* duplicates federation drags in — the same article
 * syndicated across several domains. We compare title+description token overlap and
 * fold a near-dup into the higher-scoring candidate, recording the merge so the
 * trace can show "collapsed 3 syndicated copies" rather than hiding it.
 *
 * Lexical Jaccard is the key-free first cut; this threshold check is the exact seam
 * where an embedding cosine-similarity replaces it for semantic dedup later.
 */
const SIM_THRESHOLD = 0.82;

export function dedup(candidates: Candidate[]): Candidate[] {
  // Highest RRF first, so the "winner" of each duplicate cluster is the strongest.
  const sorted = [...candidates].sort((a, b) => b.rrfScore - a.rrfScore);
  const kept: Candidate[] = [];
  const keptTokens: Set<string>[] = [];

  for (const cand of sorted) {
    const tokens = tokenize(`${cand.title} ${cand.description}`);
    let mergedInto: Candidate | undefined;

    for (let i = 0; i < kept.length; i++) {
      if (jaccard(tokens, keptTokens[i]!) >= SIM_THRESHOLD) {
        mergedInto = kept[i];
        break;
      }
    }

    if (mergedInto) {
      mergedInto.duplicatesOf.push(cand.canonicalUrl);
      // Preserve provenance from the duplicate without inflating the RRF score.
      mergedInto.appearances.push(...cand.appearances);
    } else {
      kept.push(cand);
      keptTokens.push(tokens);
    }
  }

  return kept;
}
