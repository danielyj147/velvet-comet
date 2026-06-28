import { runSearch } from "./pipeline.js";
import { saveSession, sessionsDir } from "./sessions.js";
import type { SearchRequestInput, SearchTrace } from "./types.js";

export interface RunOptions {
  /** Use embeddings + LLM expansion (local Ollama). Off → full lexical pipeline. */
  useModels?: boolean;
  /** Persist the run as a session (default true). */
  save?: boolean;
  /** Sessions directory override (default ./sessions or SPECTRA_SESSIONS_DIR). */
  dir?: string;
}

/**
 * The one orchestration entrypoint every surface calls: run the search, persist it
 * as a session. The CLI and the studio's API route are both thin adapters over this
 * — they translate their own input (argv / HTTP) into a SearchRequestInput and call
 * here. Keeping run+save in one place is why there's no second copy to drift.
 */
export async function runAndSave(
  input: SearchRequestInput,
  opts: RunOptions = {},
): Promise<{ trace: SearchTrace; sessionId: string | null }> {
  const trace = await runSearch(input, { useModels: opts.useModels });
  const sessionId = opts.save === false ? null : await saveSession(trace, opts.dir ?? sessionsDir());
  return { trace, sessionId };
}
