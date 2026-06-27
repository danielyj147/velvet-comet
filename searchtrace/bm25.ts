import { termList } from "./text.js";

/**
 * In-memory Okapi BM25 over the per-query candidate pool. Our corpus is ephemeral
 * and small (tens-to-hundreds of short docs per query), so an index (FTS5,
 * Elasticsearch) would be all overhead — scoring a few hundred docs in memory is
 * sub-millisecond. This is the lexical half of hybrid retrieval; the dense half is
 * embeddings, fused with the source-consensus signal in rerank.ts.
 */
const K1 = 1.5; // term-frequency saturation
const B = 0.75; // length normalization

export interface Bm25 {
  /** BM25 score of the query against document i. */
  score(queryTerms: string[], i: number): number;
}

export function buildBm25(docs: string[]): Bm25 {
  const docTerms = docs.map(termList);
  const n = docs.length || 1;
  const lengths = docTerms.map((t) => t.length);
  const avgdl = lengths.reduce((a, b) => a + b, 0) / n || 1;

  // document frequency per term, and per-doc term-frequency maps
  const df = new Map<string, number>();
  const tf = docTerms.map((terms) => {
    const m = new Map<string, number>();
    for (const t of terms) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return m;
  });

  const idf = (t: string) => {
    const d = df.get(t) ?? 0;
    return Math.log(1 + (n - d + 0.5) / (d + 0.5));
  };

  return {
    score(queryTerms, i) {
      const freqs = tf[i];
      if (!freqs) return 0;
      const norm = K1 * (1 - B + (B * lengths[i]!) / avgdl);
      let s = 0;
      for (const t of queryTerms) {
        const f = freqs.get(t) ?? 0;
        if (f === 0) continue;
        s += idf(t) * ((f * (K1 + 1)) / (f + norm));
      }
      return s;
    },
  };
}
