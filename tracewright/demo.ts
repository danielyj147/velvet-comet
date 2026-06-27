/**
 * CLI surface: run a flow and print a readable step-level trace.
 *   npm run demo                       # runs flows/vendor-portal-broken.json
 *   npm run demo flows/vendor-portal.json
 *
 * The same runFlow() powers the web trace viewer; this is the headless view.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { flow as flowSchema, type RunTrace, type StepEvent } from "./types.js";
import { runFlow } from "./runner.js";

const FLOW_PATH = process.argv[2] ?? "flows/vendor-portal-broken.json";

const ICON: Record<StepEvent["status"], string> = {
  pending: "·",
  running: "▸",
  passed: "✔",
  failed: "✗",
  skipped: "–",
};

function render(trace: RunTrace) {
  // Clear and redraw so the CLI shows live progress.
  process.stdout.write("\x1b[2J\x1b[H");
  console.log(`flow: ${trace.flowName}   status: ${trace.status.toUpperCase()}`);
  if (trace.liveViewUrl) console.log(`live: ${trace.liveViewUrl}`);
  console.log("");
  for (const s of trace.steps) {
    const dur = s.durationMs != null ? `${s.durationMs}ms` : "";
    const icon = s.status === "failed" ? "✗" : ICON[s.status];
    console.log(
      `  ${icon}  ${String(s.index).padStart(2)}. ${s.label}  ${dur}`,
    );
    if (s.failure) {
      console.log(`        └─ ${s.failure.reason}: ${s.failure.message}`);
      if (s.failure.screenshotPath)
        console.log(`           screenshot: ${s.failure.screenshotPath}`);
    }
  }
}

async function main() {
  const raw = JSON.parse(await readFile(FLOW_PATH, "utf8"));
  const parsed = flowSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`Invalid flow ${FLOW_PATH}:`, parsed.error.issues);
    process.exit(1);
  }

  const trace = await runFlow(parsed.data, {
    artifactsRoot: "data/traces",
    runId: randomUUID(),
    onEvent: render,
  });

  console.log("");
  if (trace.failedStepIndex !== undefined) {
    const f = trace.steps[trace.failedStepIndex]!;
    console.log(
      `Failed at step ${f.index} (${f.label}) — ${f.failure?.reason}.`,
    );
    console.log(`Artifacts in data/traces/${trace.id}/`);
    process.exit(1);
  }
  console.log("All steps passed.");
}

main().catch((err) => {
  console.error("demo failed:", err);
  process.exit(1);
});
