import { describe, it, expect } from "vitest";
import { classifyIntent, intentScore } from "../searchtrace/intent.js";
import type { Candidate } from "../searchtrace/types.js";

function cand(partial: Partial<Candidate>): Candidate {
  return {
    url: "https://x.com",
    canonicalUrl: "https://x.com",
    domain: "x.com",
    title: "",
    description: "",
    appearances: [],
    duplicatesOf: [],
    rrfScore: 0,
    relevance: 0,
    selected: false,
    ...partial,
  };
}

describe("classifyIntent", () => {
  it("detects jobs / news / buying / research, and falls back to general", () => {
    expect(classifyIntent("remote product engineer jobs")).toBe("jobs");
    expect(classifyIntent("latest ai news today")).toBe("news");
    expect(classifyIntent("best laptop vs macbook review")).toBe("buying");
    expect(classifyIntent("how does a transformer work")).toBe("research");
    expect(classifyIntent("reciprocal rank fusion")).toBe("general");
  });
});

describe("intentScore — the criterion changes with intent", () => {
  it("buying rewards comparison pages", () => {
    const comparison = cand({ title: "Best X vs Y: full comparison and review" });
    const plain = cand({ title: "X product homepage" });
    expect(intentScore("buying", comparison, "").score).toBeGreaterThan(intentScore("buying", plain, "").score);
    expect(intentScore("buying", comparison, "").factor).toBe("comparison");
  });

  it("news rewards fresh / news-sourced results", () => {
    const fresh = cand({ description: "Breaking: announced today, 2026", appearances: [{ query: "q", list: "news", position: 1 }] });
    const stale = cand({ description: "an evergreen explainer" });
    expect(intentScore("news", fresh, "").score).toBeGreaterThan(intentScore("news", stale, "").score);
  });

  it("research rewards authoritative domains", () => {
    const authoritative = cand({ domain: "arxiv.org" });
    const blog = cand({ domain: "randomblog.io" });
    expect(intentScore("research", authoritative, "").score).toBeGreaterThan(intentScore("research", blog, "").score);
  });

  it("general applies no boost", () => {
    expect(intentScore("general", cand({ title: "best vs comparison" }), "").score).toBe(0);
  });
});
