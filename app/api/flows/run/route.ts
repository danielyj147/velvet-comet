import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { flow as flowSchema } from "../../../../tracewright/types";
import { runFlow } from "../../../../tracewright/runner";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Run a flow end-to-end and return the full trace. Artifacts are written under
 *  public/artifacts so screenshots are served at /artifacts/<runId>/... */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.flowName ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!name) return NextResponse.json({ error: "flowName required" }, { status: 400 });

  let flow;
  try {
    flow = flowSchema.parse(JSON.parse(await readFile(join("flows", `${name}.json`), "utf8")));
  } catch (e) {
    return NextResponse.json({ error: `invalid flow: ${(e as Error).message}` }, { status: 400 });
  }

  try {
    const trace = await runFlow(flow, {
      artifactsRoot: "public/artifacts",
      runId: randomUUID(),
    });
    return NextResponse.json(trace);
  } catch (e) {
    console.error("[api/flows/run] failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
