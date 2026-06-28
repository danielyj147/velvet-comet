/**
 * AI provider config — one source of truth for the UI toggle, the server, and the
 * LLM layer. AI does exactly one thing here: run a small chat model for query
 * expansion + entity probes. It's OPT-IN; with none configured the pipeline runs a
 * fully lexical path (a fresh clone needs only a Firecrawl key). Ranking/dedup/
 * diversity are lexical by design — no embeddings — so the system scales to a nightly
 * batch of thousands of queries.
 *
 *   - Anthropic (ANTHROPIC_API_KEY) — Claude
 *   - OpenAI    (OPENAI_API_KEY)
 *   - Ollama    (EXPAND_MODEL, local)
 *
 * `AI_DISABLED=1` hard-disables it regardless (e.g. a deploy that shouldn't call out).
 */

export type Provider = "anthropic" | "openai" | "ollama";

export interface ProviderChoice {
  provider: Provider;
  model: string;
}

const DEFAULT_CHAT: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  ollama: "", // named explicitly via EXPAND_MODEL
};

/** Resolve the chat provider, honoring LLM_PROVIDER then falling back by what's set. */
export function resolveModels(): { disabled: boolean; chat: ProviderChoice | null } {
  const disabled = /^(1|true|yes|on)$/i.test(process.env.AI_DISABLED ?? "");
  if (disabled) return { disabled, chat: null };

  const explicit = (process.env.LLM_PROVIDER ?? "").toLowerCase() as Provider | "";
  const chatFor = (p: Provider): ProviderChoice | null => {
    if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL ?? DEFAULT_CHAT.anthropic };
    if (p === "openai" && process.env.OPENAI_API_KEY) return { provider: "openai", model: process.env.OPENAI_MODEL ?? DEFAULT_CHAT.openai };
    if (p === "ollama" && process.env.EXPAND_MODEL) return { provider: "ollama", model: process.env.EXPAND_MODEL };
    return null;
  };
  const chat = (explicit && chatFor(explicit)) || chatFor("anthropic") || chatFor("openai") || chatFor("ollama");
  return { disabled, chat };
}

export interface AiConfig {
  allowed: boolean;
  disabled: boolean;
  provider?: Provider;
  reason: string;
}

export function aiConfig(): AiConfig {
  const { disabled, chat } = resolveModels();
  const allowed = !disabled && !!chat;
  const reason = disabled
    ? "AI is disabled on this deployment."
    : allowed
      ? ""
      : "Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run Ollama (EXPAND_MODEL). Try `make models`.";
  return { allowed, disabled, provider: chat?.provider, reason };
}
