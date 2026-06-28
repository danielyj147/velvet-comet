/**
 * Embeddings — the semantic upgrade for the precision (rerank), dedup, and diversity
 * (MMR) stages. Provider is resolved from config (OpenAI or local Ollama; Anthropic
 * has no embeddings API). Everything degrades gracefully: if no embedder is configured
 * or reachable, getEmbedder() returns null and each stage falls back to its lexical
 * path, so the pipeline always runs with just a Firecrawl key.
 */
import { resolveModels } from "./config.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

export interface Embedder {
  model: string;
  /** Embed many texts; results align by index. */
  embed(texts: string[]): Promise<number[][]>;
}

// Cache the (possibly slow) probe so we don't re-pay a cold model load per search.
let probeCache: { key: string; at: number; embedder: Embedder | null } | null = null;
const PROBE_TTL_MS = 5 * 60_000;

/** Return an Embedder for the configured provider, or null (→ lexical fallback). */
export async function getEmbedder(): Promise<Embedder | null> {
  const choice = resolveModels().embed;
  if (!choice) return null;
  const key = `${choice.provider}:${choice.model}`;
  if (probeCache && probeCache.key === key && Date.now() - probeCache.at < PROBE_TTL_MS) return probeCache.embedder;

  const embedder =
    choice.provider === "openai" ? new OpenAIEmbedder(choice.model) : await probeOllama(choice.model);
  probeCache = { key, at: Date.now(), embedder };
  return embedder;
}

// --- OpenAI -----------------------------------------------------------------
class OpenAIEmbedder implements Embedder {
  private cache = new Map<string, number[]>();
  constructor(public model: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    const missing = texts.filter((t) => !this.cache.has(t));
    for (let i = 0; i < missing.length; i += 128) {
      const batch = missing.slice(i, i + 128);
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
        body: JSON.stringify({ model: this.model, input: batch }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      json.data.forEach((d, j) => this.cache.set(batch[j]!, d.embedding));
    }
    return texts.map((t) => this.cache.get(t)!);
  }
}

// --- Ollama (two embedding route shapes across versions) --------------------
type EmbedMode = "embed" | "embeddings";
const PROBE_TIMEOUT_MS = 30_000;

async function probeOllama(model: string): Promise<Embedder | null> {
  for (const mode of ["embed", "embeddings"] as EmbedMode[]) {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "embed" ? { model, input: ["ping"] } : { model, prompt: "ping" }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) return new OllamaEmbedder(model, mode);
      if (res.status === 404) continue; // wrong route or model not pulled — try the other
      console.warn(`[embeddings] Ollama /api/${mode} responded ${res.status}; lexical fallback.`);
      return null;
    } catch {
      console.warn(`[embeddings] Ollama ${OLLAMA_HOST} slow/unreachable for ${model}; lexical fallback.`);
      return null;
    }
  }
  console.warn(`[embeddings] no working embed route for "${model}" — pull it (\`ollama pull ${model}\`). Lexical fallback.`);
  return null;
}

class OllamaEmbedder implements Embedder {
  private cache = new Map<string, number[]>();
  constructor(public model: string, private mode: EmbedMode) {}

  async embed(texts: string[]): Promise<number[][]> {
    const missing = texts.filter((t) => !this.cache.has(t));
    for (let i = 0; i < missing.length; i += 64) {
      const batch = missing.slice(i, i + 64);
      const vecs = this.mode === "embed" ? await this.embedBatch(batch) : await this.embedEach(batch);
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
