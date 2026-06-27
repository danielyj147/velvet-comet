/**
 * Thin client over the two Firecrawl Browser Sandbox endpoints we need:
 *   POST   /v2/interact         -> create a stateful browser session, returns cdpUrl
 *   DELETE /v2/interact/{id}    -> close it (and release the credit-burning browser)
 *
 * We deliberately call REST directly with fetch rather than pulling the SDK: it's
 * two endpoints, every line is explainable, and we own the timeout behavior. The
 * actual step-driving happens in runner.ts over the CDP socket this returns — so
 * Firecrawl owns the anti-bot browser, and we own the per-step observability.
 */

const API_BASE = process.env.FIRECRAWL_API_BASE ?? "https://api.firecrawl.dev";

export interface BrowserSession {
  id: string;
  cdpUrl: string;
  liveViewUrl?: string;
  expiresAt?: string;
}

export interface CreateSessionOptions {
  /** Max session lifetime in seconds (Firecrawl range 30–3600, default 600). */
  ttlSeconds?: number;
  /** Auto-close after inactivity, seconds (default 300). */
  activityTtlSeconds?: number;
}

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
  }
  return key;
}

/** fetch with a hard timeout so a slow Firecrawl call can never hang our runner.
 *  (Feedback #8 mocks exactly the failure of NOT bounding external calls.) */
async function fetchJson(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<any> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });
    const text = await res.text();
    const body = text ? safeParse(text) : undefined;
    if (!res.ok) {
      const msg = body?.error ?? body?.message ?? text ?? res.statusText;
      throw new Error(`Firecrawl ${path} -> ${res.status}: ${msg}`);
    }
    return body;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Firecrawl ${path} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Create a stateful browser session and return its CDP socket URL. */
export async function createSession(
  opts: CreateSessionOptions = {},
): Promise<BrowserSession> {
  const body = await fetchJson("/v2/interact", {
    method: "POST",
    body: JSON.stringify({
      ttl: opts.ttlSeconds ?? 600,
      activityTtl: opts.activityTtlSeconds ?? 300,
    }),
  });

  // The session payload may be nested under `data` depending on API version;
  // accept either shape rather than assuming one.
  const s = body?.data ?? body;
  const cdpUrl: string | undefined = s?.cdpUrl ?? s?.cdpURL ?? s?.wsUrl;
  const id: string | undefined = s?.id ?? s?.sessionId;
  if (!cdpUrl || !id) {
    throw new Error(
      `Unexpected create-session response (no cdpUrl/id): ${JSON.stringify(body)}`,
    );
  }
  return {
    id,
    cdpUrl,
    liveViewUrl: s?.liveViewUrl ?? s?.liveURL,
    expiresAt: s?.expiresAt,
  };
}

/** Best-effort close. Never throws — closing is cleanup, not the work. */
export async function closeSession(sessionId: string): Promise<void> {
  try {
    await fetchJson(`/v2/interact/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      timeoutMs: 10_000,
    });
  } catch (err) {
    console.warn(
      `[firecrawl] failed to close session ${sessionId}:`,
      (err as Error).message,
    );
  }
}
