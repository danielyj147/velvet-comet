/**
 * The LLM layer: one `chat()` that dispatches to whichever provider is configured
 * (Anthropic / OpenAI / local Ollama — see config.ts), plus the two things the
 * pipeline asks of it: expand a query, and name the entities to probe next. Every
 * call fails soft — on any error the caller falls back to the deterministic path, so
 * search never depends on a model being up.
 *
 * Ollama's DeepSeek-R1 emits <think>…</think> before its answer, which we strip.
 */
import { resolveModels } from "./config.js";
import type { RawItem } from "./firecrawl-search.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

export function llmAvailable(): boolean {
  return !!resolveModels().chat;
}

/** Provider-agnostic single-turn completion. Returns "" on any failure. */
export async function chat(prompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const choice = resolveModels().chat;
  if (!choice) return "";
  const { maxTokens = 1024, temperature = 0.4 } = opts;
  try {
    if (choice.provider === "anthropic") return await chatAnthropic(choice.model, prompt, maxTokens, temperature);
    if (choice.provider === "openai") return await chatOpenAI(choice.model, prompt, maxTokens, temperature);
    return await chatOllama(choice.model, prompt, maxTokens, temperature);
  } catch {
    return "";
  }
}

async function chatAnthropic(model: string, prompt: string, maxTokens: number, temperature: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { content?: { text?: string }[] };
  return json.content?.map((c) => c.text ?? "").join("") ?? "";
}

async function chatOpenAI(model: string, prompt: string, maxTokens: number, temperature: number): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

async function chatOllama(model: string, prompt: string, maxTokens: number, temperature: number): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature, num_predict: maxTokens } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) return "";
  return ((await res.json()) as { response?: string }).response ?? "";
}

/** Better-recall query reformulations (the `thorough` tier's expander). */
export async function llmExpandQueries(query: string, n: number): Promise<string[]> {
  if (n <= 0 || !llmAvailable()) return [];
  const prompt =
    `Improve web-search recall for the query below. Produce ${n} ALTERNATIVE search ` +
    `queries that would surface DIFFERENT, complementary sources — synonyms, sub-aspects, ` +
    `adjacent angles, niche framings. Keep each short and specific. ` +
    `Return ONLY a JSON array of strings, nothing else.\n\nQuery: ${query}`;
  return parseList(await chat(prompt, { temperature: 0.4 }), n);
}

/** Name the salient entities (companies/products/orgs/people) in these results that
 *  are worth probing to widen coverage — sharper than the heuristic extractor. */
export async function llmExtractEntities(query: string, items: RawItem[], n: number): Promise<string[]> {
  if (n <= 0 || !llmAvailable() || items.length === 0) return [];
  const snippets = items
    .slice(0, 40)
    .map((it) => `- ${it.title}${it.description ? ` — ${it.description.slice(0, 160)}` : ""}`)
    .join("\n");
  const prompt =
    `Topic: "${query}"\n\nFrom these search results, list the ${n} most salient SPECIFIC ` +
    `entities (companies, products, organizations, people, places) that are central to the ` +
    `topic and worth searching individually to find more sources. No generic words. ` +
    `Return ONLY a JSON array of strings.\n\nResults:\n${snippets}`;
  return parseList(await chat(prompt, { temperature: 0.2 }), n);
}

function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseList(raw: string, n: number): string[] {
  const text = stripThink(raw);
  if (!text) return [];
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) return clean(arr, n);
    } catch {
      /* fall through to line parsing */
    }
  }
  return clean(
    text.split(/\r?\n/).map((l) => l.replace(/^[-*\d.)\s"]+/, "").replace(/"+$/, "")),
    n,
  );
}

function clean(arr: unknown[], n: number): string[] {
  return [...new Set(arr.map((x) => String(x).trim()).filter((s) => s.length > 1 && s.length < 200))].slice(0, n);
}
