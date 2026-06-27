import "dotenv/config";
import express from "express";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { flow as flowSchema, type Flow } from "./types.js";
import { runFlow } from "./runner.js";
import { TraceStore } from "./store.js";

const PORT = Number(process.env.PORT ?? 8787);
const FLOWS_DIR = "flows";
const ARTIFACTS_ROOT = "data/traces";
const WEB_DIST = "web-dist";

const store = new TraceStore();
const app = express();
app.use(express.json({ limit: "1mb" }));

/** Load + validate a flow file from the flows/ directory by name. */
async function loadFlow(name: string): Promise<Flow> {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "");
  const raw = JSON.parse(await readFile(join(FLOWS_DIR, `${safe}.json`), "utf8"));
  return flowSchema.parse(raw);
}

// --- API ------------------------------------------------------------------

app.get("/api/flows", async (_req, res) => {
  const files = (await readdir(FLOWS_DIR)).filter((f) => f.endsWith(".json"));
  const flows = await Promise.all(
    files.map(async (f) => {
      const parsed = flowSchema.safeParse(
        JSON.parse(await readFile(join(FLOWS_DIR, f), "utf8")),
      );
      if (!parsed.success) return null;
      return {
        name: parsed.data.name,
        description: parsed.data.description,
        stepCount: parsed.data.steps.length,
      };
    }),
  );
  res.json(flows.filter(Boolean));
});

app.get("/api/runs", (_req, res) => {
  res.json(store.list());
});

app.get("/api/runs/:id", (req, res) => {
  const trace = store.get(req.params.id);
  if (!trace) return res.status(404).json({ error: "run not found" });
  res.json(trace);
});

/** Start a run. Returns the runId immediately; progress is polled via GET. */
app.post("/api/runs", async (req, res) => {
  let flow: Flow;
  try {
    flow = req.body?.flow
      ? flowSchema.parse(req.body.flow)
      : await loadFlow(String(req.body?.flowName ?? ""));
  } catch (err) {
    return res.status(400).json({ error: `invalid flow: ${(err as Error).message}` });
  }

  const runId = randomUUID();
  res.status(202).json({ runId });

  // Fire and forget; the runner persists progress on every step event.
  runFlow(flow, {
    artifactsRoot: ARTIFACTS_ROOT,
    runId,
    onEvent: (trace) => store.save(trace),
  }).catch((err) => {
    console.error(`[server] run ${runId} crashed:`, err);
  });
});

// --- Static: artifacts + built web UI -------------------------------------

app.use("/artifacts", express.static(ARTIFACTS_ROOT));

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get("*", (_req, res) => res.sendFile(join(process.cwd(), WEB_DIST, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res
      .type("text")
      .send("API up. Run `npm run web` for the viewer (dev), or `npm run build:web` to serve it here."),
  );
}

app.listen(PORT, () => {
  console.log(`tracewright API + viewer on http://localhost:${PORT}`);
});
