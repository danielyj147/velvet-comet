import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RunTrace } from "./types.js";

/**
 * Trace store. One table of run rows; the full trace lives as a JSON blob with a
 * few columns promoted for listing/filtering. A single-table blob store is the
 * honest shape here — there's no relational model to normalize, and every line
 * is explainable. (Deliberately not Prisma: nothing to gain over ~30 lines.)
 */
export class TraceStore {
  private db: Database.Database;

  constructor(path = "data/tracewright.sqlite") {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id               TEXT PRIMARY KEY,
        flow_name        TEXT NOT NULL,
        status           TEXT NOT NULL,
        started_at       INTEGER NOT NULL,
        ended_at         INTEGER,
        failed_step_index INTEGER,
        trace_json       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
    `);
  }

  /** Insert or update a run. Called on every step event for live progress. */
  save(trace: RunTrace): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, flow_name, status, started_at, ended_at, failed_step_index, trace_json)
         VALUES (@id, @flow_name, @status, @started_at, @ended_at, @failed_step_index, @trace_json)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           ended_at = excluded.ended_at,
           failed_step_index = excluded.failed_step_index,
           trace_json = excluded.trace_json`,
      )
      .run({
        id: trace.id,
        flow_name: trace.flowName,
        status: trace.status,
        started_at: trace.startedAt,
        ended_at: trace.endedAt ?? null,
        failed_step_index: trace.failedStepIndex ?? null,
        trace_json: JSON.stringify(trace),
      });
  }

  get(id: string): RunTrace | undefined {
    const row = this.db
      .prepare(`SELECT trace_json FROM runs WHERE id = ?`)
      .get(id) as { trace_json: string } | undefined;
    return row ? (JSON.parse(row.trace_json) as RunTrace) : undefined;
  }

  /** Recent runs, newest first, as lightweight summaries for the list view. */
  list(limit = 50): RunSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, flow_name, status, started_at, ended_at, failed_step_index
         FROM runs ORDER BY started_at DESC LIMIT ?`,
      )
      .all(limit) as RunSummaryRow[];
    return rows.map((r) => ({
      id: r.id,
      flowName: r.flow_name,
      status: r.status,
      startedAt: r.started_at,
      endedAt: r.ended_at ?? undefined,
      failedStepIndex: r.failed_step_index ?? undefined,
    }));
  }
}

export interface RunSummary {
  id: string;
  flowName: string;
  status: string;
  startedAt: number;
  endedAt?: number;
  failedStepIndex?: number;
}

interface RunSummaryRow {
  id: string;
  flow_name: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  failed_step_index: number | null;
}
