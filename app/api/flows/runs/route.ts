import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunTrace } from "../../../../tracewright/types";

export const runtime = "nodejs";

const RUNS_DIR = "data/flow-runs";
const SEED_PATH = "tracewright/seed-run.json";

/** Saved flow runs: a committed example failure (so a reviewer sees the failure
 *  instantly, no live run) plus any runs persisted on this machine, newest first. */
export async function GET() {
  let seed: RunTrace | null = null;
  try {
    seed = JSON.parse(await readFile(SEED_PATH, "utf8")) as RunTrace;
  } catch {
    /* no seed committed */
  }

  let runs: RunTrace[] = [];
  try {
    const files = (await readdir(RUNS_DIR)).filter((f) => f.endsWith(".json"));
    runs = (await Promise.all(files.map((f) => readFile(join(RUNS_DIR, f), "utf8").then(JSON.parse)))) as RunTrace[];
    runs.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    /* none persisted yet */
  }

  return NextResponse.json({ seed, runs: runs.slice(0, 20) });
}
