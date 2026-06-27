import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { TraceStore } from "../src/store.js";
import type { RunTrace } from "../src/types.js";

const DB = "data/test-store.sqlite";
const cleanup = () => {
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      rmSync(DB + ext);
    } catch {
      /* ignore */
    }
  }
};
afterEach(cleanup);

function trace(id: string, status: RunTrace["status"]): RunTrace {
  return {
    id,
    flowName: "f",
    status,
    startedAt: 1000,
    steps: [{ index: 0, type: "goto", label: "go", params: {}, status: "passed", attempt: 1 }],
  };
}

describe("TraceStore", () => {
  it("upserts: saving the same id twice updates, not duplicates", () => {
    const store = new TraceStore(DB);
    store.save(trace("a", "running"));
    store.save({ ...trace("a", "failed"), failedStepIndex: 0, endedAt: 2000 });

    const got = store.get("a");
    expect(got?.status).toBe("failed");
    expect(got?.failedStepIndex).toBe(0);
    expect(store.list()).toHaveLength(1);
  });

  it("lists newest first", () => {
    const store = new TraceStore(DB);
    store.save({ ...trace("old", "passed"), startedAt: 100 });
    store.save({ ...trace("new", "passed"), startedAt: 200 });
    expect(store.list().map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("returns undefined for a missing run", () => {
    const store = new TraceStore(DB);
    expect(store.get("nope")).toBeUndefined();
  });
});
