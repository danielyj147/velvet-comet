/**
 * Spectra CLI — the primary surface. Built for the customer's reality: a nightly
 * batch of thousands of queries. Run one query or a whole file; every run is saved
 * as a session that the studio (`make studio`) can browse.
 *
 *   spectra "competitive landscape: fintech"        # one query
 *   spectra --batch queries.txt --target 30         # one per line, batch
 *   spectra --help
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { runSearch } from "./pipeline.js";
import { saveSession, sessionsDir } from "./sessions.js";
import type { Recency, SearchRequestInput, SearchSource, Tier } from "./types.js";

const HELP = `
spectra — complete, observable web search (Firecrawl)

USAGE
  spectra "<query>" [flags]          run one query
  spectra --batch <file> [flags]     run one query per line (the nightly job)

SEARCH
  --target <n>        relevant results to aim for           (default 25)
  --max-rounds <n>    mining-round budget (1–6)             (default 4)
  --tier <t>          fast | balanced | thorough            (default balanced)
  --recency <r>       any | day | week | month | year       (default any)
  --sources <a,b>     web,news                              (default web)
  --categories <a,b>  research,github,pdf
  --domains <a,b>     niche domains to also search
  --diversity <0..1>  MMR diversity                         (default 0.3)
  --min-relevance <x> precision gate                        (default 0)
  --limit <n>         results per source call               (default 10)

OUTPUT
  --out <dir>         sessions directory          (default ${sessionsDir()})
  --no-save           don't write a session
  --no-ai             force the lexical path (no embeddings/LLM)
  --concurrency <n>   parallel queries in --batch           (default 3)
  -h, --help          this help
`;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);
const list = (s?: string) => s?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];

function buildRequest(query: string): SearchRequestInput {
  return {
    query,
    tier: (flag("--tier") as Tier) ?? "balanced",
    recency: (flag("--recency") as Recency) ?? "any",
    sources: (list(flag("--sources")) as SearchSource[]).length
      ? (list(flag("--sources")) as SearchSource[])
      : ["web"],
    categories: list(flag("--categories")),
    nicheDomains: list(flag("--domains")),
    targetResults: Number(flag("--target") ?? 25),
    maxRounds: Number(flag("--max-rounds") ?? 4),
    diversity: flag("--diversity") ? Number(flag("--diversity")) : 0.3,
    minRelevance: flag("--min-relevance") ? Number(flag("--min-relevance")) : 0,
    topK: Number(flag("--target") ?? 25),
    limit: Number(flag("--limit") ?? 10),
  };
}

async function runOne(query: string): Promise<string> {
  const trace = await runSearch(buildRequest(query), { useModels: !has("--no-ai") });
  let saved = "";
  if (!has("--no-save")) saved = await saveSession(trace, flag("--out") ?? sessionsDir());
  const c = trace.coverage;
  console.log(
    `✓ "${query}" — ${trace.results.length} results · ${c.uniqueDomains} domains · ` +
      `${trace.rounds.length} rounds (${trace.stopReason})${saved ? ` · saved ${saved}` : ""}`,
  );
  return saved;
}

/** Run items through `worker` with a fixed concurrency (respects rate limits). */
async function pool<T>(items: T[], n: number, worker: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await worker(items[i++]!);
    }),
  );
}

async function main() {
  if (has("-h") || has("--help") || process.argv.length <= 2) {
    console.log(HELP);
    return;
  }

  const batchFile = flag("--batch");
  if (batchFile) {
    const queries = (await readFile(batchFile, "utf8")).split(/\r?\n/).map((q) => q.trim()).filter(Boolean);
    console.log(`Running ${queries.length} queries (concurrency ${flag("--concurrency") ?? 3}) → ${flag("--out") ?? sessionsDir()}\n`);
    let done = 0;
    await pool(queries, Number(flag("--concurrency") ?? 3), async (q) => {
      try {
        await runOne(q);
      } catch (e) {
        console.error(`✗ "${q}" — ${(e as Error).message}`);
      } finally {
        done++;
      }
    });
    console.log(`\nDone: ${done}/${queries.length}.`);
    return;
  }

  const query = process.argv[2];
  if (!query || query.startsWith("--")) {
    console.log(HELP);
    process.exit(1);
  }
  await runOne(query);
}

main().catch((err) => {
  console.error("spectra failed:", err);
  process.exit(1);
});
