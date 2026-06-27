import { describe, it, expect } from "vitest";
import { canonicalizeUrl, domainOf } from "../searchtrace/text.js";
import { buildBm25 } from "../searchtrace/bm25.js";
import { rrfFuse } from "../searchtrace/fuse.js";
import type { RankedList } from "../searchtrace/firecrawl-search.js";

describe("canonicalizeUrl — the dedup key", () => {
  it("strips tracking params, www, fragments, and trailing slash", () => {
    expect(canonicalizeUrl("https://www.Example.com/a/?utm_source=x&q=1#frag")).toBe(
      "https://example.com/a?q=1",
    );
  });
  it("treats http/https + www variants as the same canonical URL", () => {
    expect(canonicalizeUrl("http://www.example.com/p/")).toBe(canonicalizeUrl("https://example.com/p"));
  });
  it("extracts the registrable-ish domain", () => {
    expect(domainOf("https://news.example.com/x")).toBe("news.example.com");
  });
});

describe("BM25 — lexical ranking over the candidate pool", () => {
  it("scores a doc containing the query terms above one that doesn't", () => {
    const docs = ["vector database for embeddings", "a recipe for banana bread"];
    const bm25 = buildBm25(docs);
    const q = ["vector", "database"];
    expect(bm25.score(q, 0)).toBeGreaterThan(bm25.score(q, 1));
  });
  it("rewards rarer query terms (idf) — a distinctive match beats a common one", () => {
    // "alpha" is common (df=3), "beta" is rare (df=1); equal-length docs isolate idf.
    const docs = ["alpha here", "alpha there", "alpha everywhere", "beta only"];
    const bm25 = buildBm25(docs);
    expect(bm25.score(["beta"], 3)).toBeGreaterThan(bm25.score(["alpha"], 0));
  });
});

describe("rrfFuse — fusing federated ranked lists", () => {
  const lists: RankedList[] = [
    { query: "q1", list: "web", items: [
      { url: "https://a.com", title: "A", description: "", position: 1 },
      { url: "https://b.com", title: "B", description: "", position: 2 },
    ] },
    { query: "q2", list: "news", items: [
      { url: "https://a.com/", title: "A", description: "longer desc", position: 3 },
      { url: "https://c.com", title: "C", description: "", position: 1 },
    ] },
  ];

  it("merges the same URL across lists and accumulates its RRF score", () => {
    const fused = rrfFuse(lists);
    const a = fused.find((c) => c.domain === "a.com")!;
    expect(a.appearances).toHaveLength(2); // appeared in both lists
    // a is top: it ranked in two lists, so it outscores single-list b and c
    expect(fused[0]!.domain).toBe("a.com");
  });

  it("keeps the most informative description seen for a merged URL", () => {
    const fused = rrfFuse(lists);
    expect(fused.find((c) => c.domain === "a.com")!.description).toBe("longer desc");
  });
});
