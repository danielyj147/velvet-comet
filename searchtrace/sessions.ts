import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SearchTrace } from "./types.js";

/**
 * Session storage — a plain folder of JSON files, one per run. No database: the
 * nightly CLI batch writes here, and the studio reads here, so they share state
 * with zero infra. Default ./sessions, overridable for the batch job.
 */
export function sessionsDir(): string {
  return process.env.SPECTRA_SESSIONS_DIR ?? "sessions";
}

export interface SessionSummary {
  id: string;
  query: string;
  savedAt: number;
  results: number;
  domains: number;
  rounds: number;
  stopReason: string;
}

function slug(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "query";
}

/** Persist a run; returns the session id (also the filename stem). */
export async function saveSession(trace: SearchTrace, dir = sessionsDir()): Promise<string> {
  await mkdir(dir, { recursive: true });
  const stamp = new Date(trace.endedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
  const id = `${stamp}__${slug(trace.query)}`;
  await writeFile(join(dir, `${id}.json`), JSON.stringify({ id, savedAt: trace.endedAt, trace }, null, 2));
  return id;
}

/** List saved sessions, newest first, as lightweight summaries for the studio. */
export async function listSessions(dir = sessionsDir()): Promise<SessionSummary[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const summaries = await Promise.all(
    files.map(async (f): Promise<SessionSummary | null> => {
      try {
        const { id, savedAt, trace } = JSON.parse(await readFile(join(dir, f), "utf8")) as {
          id: string;
          savedAt: number;
          trace: SearchTrace;
        };
        return {
          id,
          query: trace.query,
          savedAt: savedAt ?? trace.endedAt,
          results: trace.results.length,
          domains: trace.coverage.uniqueDomains,
          rounds: trace.rounds.length,
          stopReason: trace.stopReason,
        };
      } catch {
        return null;
      }
    }),
  );
  return summaries.filter((s): s is SessionSummary => s !== null).sort((a, b) => b.savedAt - a.savedAt);
}

/** Load one saved run's full trace. */
export async function getSession(id: string, dir = sessionsDir()): Promise<SearchTrace | null> {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  try {
    const { trace } = JSON.parse(await readFile(join(dir, `${safe}.json`), "utf8")) as { trace: SearchTrace };
    return trace;
  } catch {
    return null;
  }
}
