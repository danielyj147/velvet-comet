import type { Candidate, Intent } from "./types.js";
import { termList } from "./text.js";

/**
 * Intent-aware ranking — the `intention` field customer #5 asked for ("order results
 * for that intent"). It's a RERANK directive only (orthogonal to the source/category
 * pills, which choose the corpus). Each intent scores candidates by a different
 * criterion; the pipeline normalizes those scores across the result set and blends
 * them into the order, so the ranking visibly changes with intent.
 *
 * Two design rules learned the hard way:
 *  1) Strip the query's own terms before scoring text cues — otherwise a query like
 *     "best … 2026" makes every result look equally "comparison" / "fresh", and the
 *     signal can't discriminate.
 *  2) Prefer signals that actually vary across results (domain authority, job boards,
 *     distinctive cue words) over ones that tend to be uniform.
 */

export function classifyIntent(query: string): Intent {
  const q = query.toLowerCase();
  if (/\b(jobs?|hiring|careers?|vacanc|opening|role|position|salary|remote|apply)\b/.test(q)) return "jobs";
  if (/\b(news|latest|today|breaking|update|announce|just released|this week)\b/.test(q)) return "news";
  if (/\b(best|vs|versus|compare|comparison|review|cheapest|price|pricing|buy|alternative|top \d)\b/.test(q)) return "buying";
  if (/\b(how|why|study|studies|paper|research|explain|guide|docs?|documentation|tutorial|spec)\b/.test(q)) return "research";
  return "general";
}

/** Title+description, lowercased, with the query's own terms removed (so generic
 *  query words don't make every result score the same). */
function cleanText(c: Candidate, queryTerms: Set<string>): string {
  return termList(`${c.title} ${c.description}`)
    .filter((t) => !queryTerms.has(t))
    .join(" ");
}
const fromNews = (c: Candidate) => c.appearances.some((a) => a.list.includes("news"));

function countCues(text: string, cues: RegExp[]): number {
  return cues.filter((re) => re.test(text)).length;
}

const COMPARISON_CUES = [/\bvs\b|versus/, /compar/, /review/, /rating/, /ranking/, /tested/, /top \d/, /alternativ/, /pros and cons/, /\bdeal\b|\bdeals\b/, /cheapest|lowest price/];
const RECENCY_CUES = [/today|tonight/, /breaking/, /\bjust\b/, /hours? ago|minutes? ago|days? ago/, /\blive\b/, /announced|unveiled/, /\bupdate[ds]?\b/];

const AUTHORITY: Array<[string, number]> = [
  [".gov", 0.95], [".edu", 0.9], ["arxiv.org", 1.0], ["nature.com", 0.95], ["ieee.org", 0.9],
  ["pubmed", 0.95], ["nih.gov", 0.95], ["acm.org", 0.9], ["who.int", 0.9], ["wikipedia.org", 0.7],
  ["sciencedirect", 0.85], ["springer", 0.85],
];
const JOB_BOARDS = ["greenhouse.io", "lever.co", "ashbyhq.com", "workday", "indeed.com", "linkedin.com", "wellfound.com", "weworkremotely", "ycombinator.com"];

/** Domain authority, query-independent so it discriminates by source. */
function authority(c: Candidate): number {
  const hit = AUTHORITY.find(([d]) => c.domain.endsWith(d) || c.domain.includes(d));
  let s = hit ? hit[1] : 0;
  if (fromList(c, "category:research")) s = Math.max(s, 0.7);
  return s;
}
const fromList = (c: Candidate, frag: string) => c.appearances.some((a) => a.list.includes(frag));

/** The intent score (0..1, pre-normalization) + the human label for the boost. */
export function intentScore(intent: Intent, c: Candidate, query: string): { score: number; factor: string } {
  const qTerms = new Set(termList(query));
  const text = cleanText(c, qTerms);
  switch (intent) {
    case "news": {
      const s = Math.min(1, countCues(text, RECENCY_CUES) * 0.4 + (fromNews(c) ? 0.5 : 0));
      return { score: s, factor: "fresh" };
    }
    case "research":
      return { score: authority(c), factor: "authoritative" };
    case "buying":
      return { score: Math.min(1, countCues(text, COMPARISON_CUES) * 0.4), factor: "comparison" };
    case "jobs": {
      const board = JOB_BOARDS.some((d) => c.domain.includes(d.split("/")[0]!)) ? 0.7 : 0;
      const s = Math.min(1, board + countCues(text, RECENCY_CUES) * 0.3 + (/career|hiring|apply|vacanc/.test(text) ? 0.2 : 0));
      return { score: s, factor: "recent posting" };
    }
    case "general":
      return { score: 0, factor: "" };
  }
}
