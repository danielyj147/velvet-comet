/**
 * AI provider config — one source of truth for the UI toggle, the server, and the
 * model layer. Three providers are supported, all OPT-IN; with none configured the
 * pipeline runs a full lexical path (a fresh clone needs only a Firecrawl key).
 *
 *   - Anthropic (ANTHROPIC_API_KEY) — chat: query expansion + entity probes
 *   - OpenAI    (OPENAI_API_KEY)    — chat + embeddings
 *   - Ollama    (EMBED_MODEL / EXPAND_MODEL, local) — chat + embeddings
 *
 * `AI_DISABLED=1` hard-disables everything regardless (a deploy whose box can't or
 * shouldn't serve models). Anthropic has no public embeddings API, so semantic
 * ranking needs OpenAI or Ollama; Claude still powers the chat/entity path.
 */

export type Provider = "anthropic" | "openai" | "ollama";

export interface ProviderChoice {
  provider: Provider;
  model: string;
}

const DEFAULT_MODEL: Record<Provider, { chat: string; embed?: string }> = {
  anthropic: { chat: "claude-haiku-4-5" },
  openai: { chat: "gpt-4o-mini", embed: "text-embedding-3-small" },
  ollama: { chat: "" }, // Ollama models are named explicitly via env
};

/** Resolve which provider serves chat (expansion/entities) and which serves
 *  embeddings, honoring an explicit LLM_PROVIDER then falling back by what's set. */
export function resolveModels(): { disabled: boolean; chat: ProviderChoice | null; embed: ProviderChoice | null } {
  const disabled = /^(1|true|yes|on)$/i.test(process.env.AI_DISABLED ?? "");
  if (disabled) return { disabled, chat: null, embed: null };

  const explicit = (process.env.LLM_PROVIDER ?? "").toLowerCase() as Provider | "";
  const have: Record<Provider, boolean> = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    ollama: !!process.env.EXPAND_MODEL,
  };

  const chatFor = (p: Provider): ProviderChoice | null => {
    if (p === "anthropic" && have.anthropic) return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL.anthropic.chat };
    if (p === "openai" && have.openai) return { provider: "openai", model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL.openai.chat };
    if (p === "ollama" && have.ollama) return { provider: "ollama", model: process.env.EXPAND_MODEL! };
    return null;
  };
  const chat = (explicit && chatFor(explicit)) || chatFor("anthropic") || chatFor("openai") || chatFor("ollama");

  // Embeddings: Anthropic has none. Respect an explicit embed-capable provider, else
  // prefer OpenAI (if keyed), else local Ollama (if EMBED_MODEL set).
  const haveOpenAIEmbed = !!process.env.OPENAI_API_KEY;
  const haveOllamaEmbed = !!process.env.EMBED_MODEL;
  let embed: ProviderChoice | null = null;
  if (explicit === "ollama" && haveOllamaEmbed) embed = { provider: "ollama", model: process.env.EMBED_MODEL! };
  else if (explicit === "openai" && haveOpenAIEmbed) embed = { provider: "openai", model: process.env.OPENAI_EMBED_MODEL ?? DEFAULT_MODEL.openai.embed! };
  else if (haveOpenAIEmbed) embed = { provider: "openai", model: process.env.OPENAI_EMBED_MODEL ?? DEFAULT_MODEL.openai.embed! };
  else if (haveOllamaEmbed) embed = { provider: "ollama", model: process.env.EMBED_MODEL! };

  return { disabled, chat, embed };
}

export interface AiConfig {
  allowed: boolean;
  disabled: boolean;
  embed: boolean;
  expand: boolean;
  /** Resolved provider names, for the UI ("anthropic" / "openai" / "ollama"). */
  chatProvider?: Provider;
  embedProvider?: Provider;
  reason: string;
}

export function aiConfig(): AiConfig {
  const m = resolveModels();
  const embed = !!m.embed;
  const expand = !!m.chat;
  const allowed = !m.disabled && (embed || expand);
  const reason = m.disabled
    ? "AI is disabled on this deployment."
    : allowed
      ? ""
      : "Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run Ollama (EMBED_MODEL / EXPAND_MODEL). Try `make models`.";
  return { allowed, disabled: m.disabled, embed, expand, chatProvider: m.chat?.provider, embedProvider: m.embed?.provider, reason };
}
