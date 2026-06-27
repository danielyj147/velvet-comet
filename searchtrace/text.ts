/**
 * Small, dependency-free text utilities for the lexical stages. These keep the
 * first cut key-free; the similarity function is the single seam where dense
 * embeddings (e.g. transformers.js all-MiniLM) drop in later for the dedup and
 * MMR stages without touching their logic.
 */

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|ref_|igshid|spm$)/i;

/** Canonicalize a URL into a stable dedup key: https, lowercased host, no `www.`,
 *  no fragment, tracking params stripped, remaining params sorted. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.protocol = "https:";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    // Normalize a trailing slash on the path (so /a/ and /a dedup the same).
    u.pathname = u.pathname.replace(/\/+$/, "");
    const kept = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    for (const [k, v] of kept) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return raw.trim();
  }
}

/** Registrable-ish domain (no PSL; good enough): host minus leading www. */
export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return raw;
  }
}

const STOPWORDS = new Set(
  "the a an and or of to in for on with is are be this that it as at by from".split(" "),
);

/** Unique terms — for set-overlap similarity (Jaccard). */
export function tokenize(text: string): Set<string> {
  return new Set(termList(text));
}

/** Terms with repeats preserved — for term-frequency scoring (BM25). */
export function termList(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Jaccard similarity of two token sets — 0 (disjoint) to 1 (identical). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
