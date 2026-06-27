/**
 * Embeddings via a local Ollama model — the semantic upgrade for the precision
 * (rerank), dedup, and diversity (MMR) stages. Everything degrades gracefully:
 * if Ollama isn't reachable, getEmbedder() returns null and each stage falls back
 * to its lexical path, so the pipeline always runs.
 *
 * Opt-in: the semantic path is OFF unless EMBED_MODEL is set, so a fresh clone
 * (reviewer, or a deployed live link) runs the lexical path with no local models.
 * Set EMBED_MODEL (e.g. qwen3-embedding:8b) + run Ollama to enable it.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "";

export interface Embedder {
  model: string;
  /** Embed many texts; results align by index. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Ollama exposes two embedding shapes across versions: the newer batch
 *  `/api/embed` ({input:[...]} -> {embeddings:[[...]]}) and the older
 *  `/api/embeddings` ({prompt} -> {embedding:[...]}). We detect which works. */
type EmbedMode = "embed" | "embeddings";

// Cache the probe result so we don't re-pay the (possibly slow) model cold-load on
// every search. Large embedding models can take >5s to load on first call.
let probeCache: { at: number; embedder: Embedder | null } | null = null;
const PROBE_TTL_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 30_000;

/** Return a cached Embedder, or probe Ollama (both embed routes) for one.
 *  Returns null immediately when EMBED_MODEL is unset (model path opt-in). */
export async function getEmbedder(): Promise<Embedder | null> {
  if (!EMBED_MODEL) return null;
  if (probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) return probeCache.embedder;
  const embedder = await probeEmbedder();
  probeCache = { at: Date.now(), embedder };
  return embedder;
}

async function probeEmbedder(): Promise<Embedder | null> {
  for (const mode of ["embed", "embeddings"] as EmbedMode[]) {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "embed"
            ? { model: EMBED_MODEL, input: ["ping"] }
            : { model: EMBED_MODEL, prompt: "ping" },
        ),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) return new OllamaEmbedder(mode);
      if (res.status === 404) continue; // wrong route or model not pulled — try the other
      console.warn(`[embeddings] Ollama /api/${mode} responded ${res.status}; lexical fallback.`);
      return null;
    } catch {
      console.warn(`[embeddings] Ollama ${OLLAMA_HOST} slow/unreachable for ${EMBED_MODEL}; lexical fallback.`);
      return null;
    }
  }
  console.warn(
    `[embeddings] no working embed route for model "${EMBED_MODEL}" — pull it with ` +
      `\`ollama pull ${EMBED_MODEL}\`. Using lexical fallback.`,
  );
  return null;
}

class OllamaEmbedder implements Embedder {
  model = EMBED_MODEL;
  private cache = new Map<string, number[]>();
  constructor(private mode: EmbedMode) {}

  async embed(texts: string[]): Promise<number[][]> {
    const missing = texts.filter((t) => !this.cache.has(t));
    for (let i = 0; i < missing.length; i += 64) {
      const batch = missing.slice(i, i + 64);
      const vecs =
        this.mode === "embed" ? await this.embedBatch(batch) : await this.embedEach(batch);
      vecs.forEach((vec, j) => this.cache.set(batch[j]!, vec));
    }
    return texts.map((t) => this.cache.get(t)!);
  }

  private async embedBatch(batch: string[]): Promise<number[][]> {
    const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: batch }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Ollama /api/embed failed: ${res.status}`);
    return ((await res.json()) as { embeddings: number[][] }).embeddings;
  }

  private async embedEach(batch: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const prompt of batch) {
      const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Ollama /api/embeddings failed: ${res.status}`);
      out.push(((await res.json()) as { embedding: number[] }).embedding);
    }
    return out;
  }
}

/** Cosine similarity of two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
