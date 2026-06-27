import type { Candidate, Intent } from "./types.js";

/**
 * Intent-aware ranking — the `intention` field customer #5 asked for. Plain search
 * ranks one way; #5's users ask news / buying / research / jobs questions, each of
 * which wants a *different* criterion. We resolve the intent (inferred or explicit)
 * and compute a per-candidate intent score from interpretable signals, which the
 * pipeline blends into the final ordering. Heuristic and deterministic (no model
 * required), so it works on a fresh clone — an LLM classifier can drop in later.
 */

/** Infer intent from the query for the "auto" setting. First match wins. */
export function classifyIntent(query: string): Intent {
  const q = query.toLowerCase();
  if (/\b(jobs?|hiring|careers?|vacanc|opening|role|position|salary|remote|apply)\b/.test(q))
    return "jobs";
  if (/\b(news|latest|today|breaking|update|announce|just released|this week)\b/.test(q))
    return "news";
  if (/\b(best|vs|versus|compare|comparison|review|cheapest|price|pricing|buy|alternative|top \d)\b/.test(q))
    return "buying";
  if (/\b(how|why|study|studies|paper|research|explain|guide|docs?|documentation|tutorial|spec)\b/.test(q))
    return "research";
  return "general";
}

const text = (c: Candidate) => `${c.title} ${c.description}`.toLowerCase();
const fromList = (c: Candidate, frag: string) =>
  c.appearances.some((a) => a.list.includes(frag));

/** Recent-ish: explicit recency words or a current/near year, and news provenance. */
function freshness(c: Candidate): number {
  const t = text(c);
  let s = 0;
  if (/\b(2026|2025|today|latest|breaking|just|now|update|hours? ago|days? ago)\b/.test(t)) s += 0.6;
  if (fromList(c, "news")) s += 0.5;
  return Math.min(1, s);
}

const AUTHORITY = [".gov", ".edu", "arxiv.org", "nature.com", "ieee.org", "pubmed", "acm.org", "who.int", "nih.gov", "wikipedia.org"];
/** Credible source: authoritative domain or research provenance. */
function authority(c: Candidate): number {
  let s = 0;
  if (AUTHORITY.some((d) => c.domain.endsWith(d) || c.domain.includes(d))) s += 0.7;
  if (fromList(c, "category:research")) s += 0.5;
  return Math.min(1, s);
}

/** Comparison density: pages that actually compare products (the #5 buying ask). */
function comparison(c: Candidate): number {
  const t = text(c);
  const hits = [/\bvs\b|versus/, /compar/, /\bbest\b/, /\btop \d/, /review/, /alternativ/, /pros and cons/, /which .* (should|to)/].filter((re) => re.test(t)).length;
  return Math.min(1, hits * 0.34);
}

const JOB_BOARDS = ["greenhouse.io", "lever.co", "ashbyhq.com", "workday", "indeed.com", "linkedin.com", "wellfound.com", "ycombinator.com/jobs", "weworkremotely"];
/** Recent posting on a real job board (the jobs narrative). */
function jobRecency(c: Candidate): number {
  let s = freshness(c) * 0.6;
  if (JOB_BOARDS.some((d) => c.domain.includes(d.split("/")[0]!)) || /\b(careers?|jobs?)\b/.test(text(c))) s += 0.6;
  return Math.min(1, s);
}

/** The intent score + the human label for *why* it was boosted. */
export function intentScore(intent: Intent, c: Candidate): { score: number; factor: string } {
  switch (intent) {
    case "news":
      return { score: freshness(c), factor: "fresh" };
    case "research":
      return { score: authority(c), factor: "authoritative" };
    case "buying":
      return { score: comparison(c), factor: "comparison" };
    case "jobs":
      return { score: jobRecency(c), factor: "recent posting" };
    case "general":
      return { score: 0, factor: "" };
  }
}
