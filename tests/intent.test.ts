import { describe, it, expect } from "vitest";
import { classifyIntent, intentScore, rerankByIntent } from "../searchtrace/intent.js";
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

describe("rerankByIntent — the criterion knob measurably reorders (the verifiable claim)", () => {
  it("lifts comparison density in top-k, even when comparison pages have lower relevance", () => {
    const pool = [
      cand({ canonicalUrl: "a", relevance: 1.0, title: "X overview" }),
      cand({ canonicalUrl: "b", relevance: 0.9, title: "X homepage" }),
      cand({ canonicalUrl: "c", relevance: 0.4, title: "X vs Y full comparison and review" }),
      cand({ canonicalUrl: "d", relevance: 0.3, title: "Top 10 X tested, ranked" }),
    ];
    const lift = rerankByIntent(pool, "buying", "", 0.4, 2)!;
    // the comparison knob pushes comparison pages into the top-k vs relevance order
    expect(lift.after).toBeGreaterThan(lift.before);
    // and a high-comparison / low-relevance page now outranks a bland high-relevance one
    expect(pool[0]!.canonicalUrl === "c" || pool[1]!.canonicalUrl === "c").toBe(true);
  });

  it("general intent leaves relevance order untouched (no lift)", () => {
    const pool = [cand({ canonicalUrl: "a", relevance: 0.9 }), cand({ canonicalUrl: "b", relevance: 0.5 })];
    expect(rerankByIntent(pool, "general", "", 0.4, 2)).toBeUndefined();
    expect(pool[0]!.rankScore).toBe(0.9);
  });
});
