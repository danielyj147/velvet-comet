import { termList } from "./text.js";
import { llmExtractEntities } from "./llm.js";
import type { RawItem } from "./firecrawl-search.js";

/**
 * Query decomposition for completeness. The recall problem isn't "rank 51+ of the same
 * SERP" — it's that one query is a single narrow probe of a topic's source space. So we
 * probe it many ways. Entities are the strong, generic lever: a regional outlet covers
 * "Acme Corp", not "competitive landscape of fraud detection", so searching the entity
 * surfaces it. Critically these sub-queries are derived from the topic's OWN results, so
 * this generalizes to any topic/client with zero per-topic config — and it's AI-free.
 */

const STOP = new Set(
  ("the a an and or of for to in on with at by from is are was best top guide how what why " +
    "review reviews vs list tools tool software platform platforms company companies inc llc " +
    "ltd corp news report reports market your you our we more most new update updated home page")
    .split(" "),
);

const YEAR = /^(19|20)\d\d$/;

/** Salient phrases that recur across results: capitalized phrases in (sentence-case)
 *  snippets + quoted strings. Frequency ≥2 filters one-off noise; query terms and bare
 *  stopwords/years are dropped so the probes go somewhere new. */
export function extractEntities(items: RawItem[], query: string, max = 6): string[] {
  const queryTerms = new Set(termList(query));
  const counts = new Map<string, { display: string; n: number }>();

  const bump = (raw: string) => {
    const display = raw.trim().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
    if (display.length < 3 || display.length > 48) return;
    const words = display.toLowerCase().split(" ");
    // Skip if it's entirely stopwords / query terms / years (adds no new probe).
    if (words.every((w) => STOP.has(w) || queryTerms.has(w) || YEAR.test(w))) return;
    const key = display.toLowerCase();
    const e = counts.get(key) ?? { display, n: 0 };
    e.n += 1;
    counts.set(key, e);
  };

  for (const it of items) {
    const desc = it.description ?? "";
    // Proper-noun-ish runs of Capitalized words (orgs, products, places) in snippets.
    for (const m of desc.matchAll(/\b([A-Z][a-zA-Z0-9&.'’-]+(?:\s+[A-Z][a-zA-Z0-9&.'’-]+){0,3})\b/g)) {
      if (m[1]) bump(m[1]);
    }
    // Explicitly quoted phrases anywhere.
    for (const m of `${it.title} ${desc}`.matchAll(/["“”']([^"“”']{3,40})["“”']/g)) {
      if (m[1]) bump(m[1]);
    }
  }

  return [...counts.values()]
    .filter((e) => e.n >= 2)
    .sort((a, b) => b.n - a.n || b.display.length - a.display.length)
    .slice(0, max)
    .map((e) => e.display);
}

/** Pick the entities to probe next: an LLM does it sharply when AI is on, otherwise
 *  the heuristic above. Falls back automatically if the model returns nothing. */
export async function deriveEntities(
  items: RawItem[],
  query: string,
  max: number,
  useModels: boolean,
): Promise<string[]> {
  if (useModels) {
    const llm = await llmExtractEntities(query, items, max);
    if (llm.length) return llm;
  }
  return extractEntities(items, query, max);
}

/** Does a result hit one of the topic-derived entities? Used to count an entity-probe
 *  result as on-topic even when it doesn't lexically match the original query. */
export function mentionsEntity(it: RawItem, entities: Set<string>): boolean {
  if (entities.size === 0) return false;
  const hay = `${it.title} ${it.description ?? ""}`.toLowerCase();
  for (const e of entities) if (hay.includes(e)) return true;
  return false;
}
