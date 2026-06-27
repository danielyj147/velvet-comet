/**
 * AI availability config — one source of truth for the UI toggle and the server.
 *
 * Three states matter:
 *   - models configured? (EMBED_MODEL / EXPAND_MODEL set)
 *   - hard-disabled?     (AI_DISABLED set — e.g. a deploy whose box can't serve models)
 *   - therefore allowed? (configured AND not disabled)
 *
 * When not allowed, the UI shows the toggle greyed out with `reason` as a tooltip,
 * and the server refuses to use models even if a request asks for them.
 */
export interface AiConfig {
  allowed: boolean;
  disabled: boolean;
  embed: boolean;
  expand: boolean;
  reason: string;
}

export function aiConfig(): AiConfig {
  const disabled = /^(1|true|yes|on)$/i.test(process.env.AI_DISABLED ?? "");
  const embed = !!process.env.EMBED_MODEL;
  const expand = !!process.env.EXPAND_MODEL;
  const allowed = !disabled && (embed || expand);

  const reason = disabled
    ? "AI is disabled on this deployment."
    : !embed && !expand
      ? "Requires a local Ollama with EMBED_MODEL / EXPAND_MODEL set."
      : "";

  return { allowed, disabled, embed, expand, reason };
}
