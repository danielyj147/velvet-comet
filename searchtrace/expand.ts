/**
 * Query expansion — turn one query into several, so candidate generation walks
 * *wider* (more of the space) instead of just *deeper* into one head-heavy list.
 * This is the lever the deprecated deep-research had and plain `search` lost.
 *
 * The default expander is deterministic and key-free (honest for a demo). The
 * Expander interface is the seam where an LLM decomposer drops in for the
 * "thorough" tier — same signature, better breadth.
 */

import type { Tier } from "./types.js";

export type Expander = (query: string, max: number) => Promise<string[]>;

/** How many query variants each tier uses. fast = raw only (serves #4). */
function expansionBudget(tier: Tier): number {
  return tier === "fast" ? 1 : tier === "balanced" ? 3 : 6;
}

/** Deterministic reformulations. Generic by design — they retrieve *different*
 *  result sets, which is the point; fusion + diversity sort out the overlap. The
 *  raw query is always first and always kept. */
const VARIANT_TEMPLATES = [
  (q: string) => `"${q}"`, // exact-phrase: different SERP than the loose query
  (q: string) => `${q} overview`,
  (q: string) => `${q} latest`,
  (q: string) => `${q} comparison`,
  (q: string) => `${q} analysis`,
  (q: string) => `${q} report`,
];

export const heuristicExpander: Expander = async (query, max) => {
  const out = [query];
  for (const t of VARIANT_TEMPLATES) {
    if (out.length >= max) break;
    const v = t(query);
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, max);
};

/**
 * Expand a query for a tier using the given expander (default: heuristic).
 * Always dedupes and guarantees the raw query is present.
 */
export async function expand(
  query: string,
  tier: Tier,
  expander: Expander = heuristicExpander,
): Promise<string[]> {
  const max = expansionBudget(tier);
  if (max <= 1) return [query];
  const expansions = await expander(query, max);
  const set = new Set<string>([query, ...expansions]);
  return [...set].slice(0, max);
}
