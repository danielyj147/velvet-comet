/**
 * LLM query expansion via a local Ollama model (DeepSeek-R1 by default). Real
 * sub-question / paraphrase decomposition beats template variants for recall — it
 * surfaces genuinely different sources. Used by the `thorough` tier; on any failure
 * the caller falls back to the deterministic heuristic expander, so search never
 * depends on the model being up.
 *
 * DeepSeek-R1 emits <think>…</think> reasoning before its answer, which we strip.
 */
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
// Opt-in: unset EXPAND_MODEL → no LLM call, caller uses the heuristic expander.
const EXPAND_MODEL = process.env.EXPAND_MODEL ?? "";

export async function llmExpandQueries(query: string, n: number): Promise<string[]> {
  if (n <= 0 || !EXPAND_MODEL) return [];
  const prompt =
    `Improve web-search recall for the query below. Produce ${n} ALTERNATIVE search ` +
    `queries that would surface DIFFERENT, complementary sources — synonyms, sub-aspects, ` +
    `adjacent angles, niche framings. Keep each short and specific. ` +
    `Return ONLY a JSON array of strings, nothing else.\n\nQuery: ${query}`;
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EXPAND_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.4, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { response?: string };
    return parseQueries(json.response ?? "", n);
  } catch {
    return [];
  }
}

function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseQueries(raw: string, n: number): string[] {
  const text = stripThink(raw);
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) return clean(arr, n);
    } catch {
      /* fall through to line parsing */
    }
  }
  // Fallback: one query per line, stripped of bullets/numbering/quotes.
  return clean(
    text.split(/\r?\n/).map((l) => l.replace(/^[-*\d.)\s"]+/, "").replace(/"+$/, "")),
    n,
  );
}

function clean(arr: unknown[], n: number): string[] {
  return arr
    .map((x) => String(x).trim())
    .filter((s) => s.length > 1 && s.length < 200)
    .slice(0, n);
}
