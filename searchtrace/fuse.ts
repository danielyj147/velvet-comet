import type { RankedList } from "./firecrawl-search.js";
import type { Candidate } from "./types.js";
import { canonicalizeUrl, domainOf } from "./text.js";

/**
 * Reciprocal Rank Fusion (RRF). Merge many ranked lists into one using only
 * positions, so lists with incomparable scores (web vs news vs a domain search)
 * fuse cleanly: score(d) = Σ 1/(k + rank_in_list). A URL that ranks decently
 * across several expansions/sources floats up; a single-list fluke stays down.
 *
 * k (default 60, the standard) damps the influence of the very top ranks so a
 * #1-in-one-list doesn't automatically beat a consistent-across-many result.
 */
const RRF_K = 60;

export function rrfFuse(lists: RankedList[]): Candidate[] {
  const byCanonical = new Map<string, Candidate>();

  for (const list of lists) {
    for (const item of list.items) {
      const canonicalUrl = canonicalizeUrl(item.url);
      const contribution = 1 / (RRF_K + item.position);

      let cand = byCanonical.get(canonicalUrl);
      if (!cand) {
        cand = {
          url: item.url,
          canonicalUrl,
          domain: domainOf(item.url),
          title: item.title,
          description: item.description,
          appearances: [],
          duplicatesOf: [],
          rrfScore: 0,
          relevance: 0,
          selected: false,
        };
        byCanonical.set(canonicalUrl, cand);
      }
      cand.appearances.push({ query: list.query, list: list.list, position: item.position });
      cand.rrfScore += contribution;
      // Prefer the longest description we've seen for this URL (most informative).
      if (item.description.length > cand.description.length) cand.description = item.description;
      if (!cand.title && item.title) cand.title = item.title;
    }
  }

  return [...byCanonical.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}
