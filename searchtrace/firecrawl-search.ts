/**
 * Federated client over Firecrawl `/v2/search`. The completeness fix lives here:
 * instead of one query → one head-heavy list, we issue many calls (expanded
 * queries × sources × categories × niche domains) and return each as a labelled
 * ranked list for the fusion stage to merge. Every call is timeout-bounded and
 * retried on transient errors, and failures degrade gracefully — one dead list
 * must never sink the whole search.
 */

const API_BASE = process.env.FIRECRAWL_API_BASE ?? "https://api.firecrawl.dev";

export interface RawItem {
  url: string;
  title: string;
  description: string;
  position: number;
}

/** Passed to /v2/search.scrapeOptions when "fetch content" is on — this is where
 *  maxAge (content-cache freshness) legitimately lives (it's a scrape param, not a
 *  top-level search param). */
export interface ScrapeOptions {
  formats: string[];
  maxAge?: number;
}

/** A single labelled ranked list, e.g. list "domain:trade.example" for query Q. */
export interface RankedList {
  query: string;
  list: string;
  items: RawItem[];
}

interface SearchCallOptions {
  sources?: string[];
  categories?: string[];
  includeDomains?: string[];
  excludeDomains?: string[];
  limit?: number;
  /** Firecrawl time filter, e.g. "qdr:w" for the past week (result recency). */
  tbs?: string;
  /** When set, fetch full content per result (maxAge lives in here). */
  scrapeOptions?: ScrapeOptions;
  timeoutMs?: number;
}

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set (copy .env.example to .env).");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TerminalHttpError extends Error {}
const retryable = (s: number) => s === 429 || s === 408 || (s >= 500 && s < 600);

/** One raw search call → Firecrawl's `data` object (keyed by source). */
async function searchCall(query: string, opts: SearchCallOptions): Promise<any> {
  const { timeoutMs = 20_000, ...rest } = opts;
  const body: Record<string, unknown> = { query, limit: rest.limit ?? 10 };
  if (rest.sources) body.sources = rest.sources;
  if (rest.categories?.length) body.categories = rest.categories;
  if (rest.includeDomains?.length) body.includeDomains = rest.includeDomains;
  if (rest.excludeDomains?.length) body.excludeDomains = rest.excludeDomains;
  if (rest.tbs) body.tbs = rest.tbs;
  if (rest.scrapeOptions) body.scrapeOptions = rest.scrapeOptions;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}/v2/search`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (res.ok) return json.data ?? json;
      const msg = json?.error ?? text ?? res.statusText;
      const detail = `search -> ${res.status}: ${msg}`;
      if (!retryable(res.status)) throw new TerminalHttpError(detail);
      lastErr = new Error(detail);
    } catch (err) {
      if (err instanceof TerminalHttpError) throw err;
      lastErr =
        err instanceof Error && err.name === "AbortError"
          ? new Error(`search timed out after ${timeoutMs}ms`)
          : err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 3) break;
    const backoff = Math.min(2_000, 500 * 2 ** attempt);
    await sleep(backoff / 2 + Math.random() * (backoff / 2));
  }
  throw lastErr;
}

/** Split a Firecrawl `data` object into one RankedList per source key. */
function splitBySource(query: string, data: any, listPrefix = ""): RankedList[] {
  if (!data || typeof data !== "object") return [];
  const out: RankedList[] = [];
  for (const [source, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue;
    out.push({
      query,
      list: listPrefix ? `${listPrefix}:${source}` : source,
      items: items
        .filter((it: any) => it?.url)
        .map((it: any, i: number) => ({
          url: it.url,
          title: it.title ?? "",
          // When content was fetched, use a richer slice of the markdown as the
          // text the ranker sees; otherwise the snippet description.
          description: it.markdown ? String(it.markdown).slice(0, 1200) : (it.description ?? ""),
          position: it.position ?? i + 1,
        })),
    });
  }
  return out;
}

/**
 * Federate one (expanded) query across the base sources, the categories, and each
 * niche domain. Returns every resulting ranked list. Per-list failures are logged
 * and skipped, not thrown.
 */
export async function federateQuery(
  query: string,
  opts: {
    sources: string[];
    categories: string[];
    nicheDomains: string[];
    limit: number;
    tbs?: string;
    /** Domains to exclude — the AI-free long-tail mining lever. Applied to the
     *  base + category calls only (Firecrawl forbids include+exclude together, and
     *  the niche calls use includeDomains). */
    excludeDomains?: string[];
    /** When set, fetch full content per result with this cache freshness (ms). */
    contentMaxAge?: number;
  },
): Promise<RankedList[]> {
  const tasks: Promise<RankedList[]>[] = [];
  const scrapeOptions: ScrapeOptions | undefined =
    opts.contentMaxAge != null ? { formats: ["markdown"], maxAge: opts.contentMaxAge } : undefined;
  const common = { limit: opts.limit, tbs: opts.tbs, scrapeOptions };
  const exclude = opts.excludeDomains?.length ? { excludeDomains: opts.excludeDomains } : {};

  // Base sources (web/news) in one call; split the response per source.
  tasks.push(
    searchCall(query, { sources: opts.sources, ...exclude, ...common })
      .then((data) => splitBySource(query, data))
      .catch((e) => {
        console.warn(`[search] base list failed (${query}):`, (e as Error).message);
        return [];
      }),
  );

  // Each category as its own list.
  for (const cat of opts.categories) {
    tasks.push(
      searchCall(query, { categories: [cat], ...exclude, ...common })
        .then((data) => splitBySource(query, data, `category:${cat}`))
        .catch((e) => {
          console.warn(`[search] category ${cat} failed:`, (e as Error).message);
          return [];
        }),
    );
  }

  // Each niche domain searched explicitly — this is what pulls in the long tail.
  for (const domain of opts.nicheDomains) {
    tasks.push(
      searchCall(query, { includeDomains: [domain], ...common })
        .then((data) =>
          splitBySource(query, data, `domain`).map((l) => ({ ...l, list: `domain:${domain}` })),
        )
        .catch((e) => {
          console.warn(`[search] domain ${domain} failed:`, (e as Error).message);
          return [];
        }),
    );
  }

  const lists = (await Promise.all(tasks)).flat();
  return lists.filter((l) => l.items.length > 0);
}
