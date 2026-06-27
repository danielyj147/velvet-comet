import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { flow as flowSchema } from "../../../../tracewright/types";
import { runFlow } from "../../../../tracewright/runner";

export const runtime = "nodejs";
export const maxDuration = 120;

const RUNS_DIR = "data/flow-runs";

/**
 * "Check a page": the user pastes any URL; we drive a real browser to it and report
 * pass/fail. Two steps — load the page, then assert it actually returned content —
 * so anti-bot blocks, captchas, timeouts, and empty/404 pages surface as a
 * *classified* failure (the same taxonomy the multi-step flows use), not a guess.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  let url = String(body?.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const checkFlow = flowSchema.parse({
    name: `check ${url}`,
    description: "Load the page and confirm it returned real content.",
    steps: [
      { type: "goto", url, label: `Load ${url}` },
      {
        type: "evaluate",
        label: "Confirm the page returned content",
        // Lenient on purpose: only fail a TRULY empty response (no text and no
        // title). Combined with the classifier's DOM check (captcha/block markers
        // take precedence), this catches blocks/dead pages without false-failing
        // legitimately thin pages.
        script:
          "(() => { const t = (document.body && document.body.innerText || '').trim(); const title = (document.title || '').trim(); if (t.length === 0 && title.length === 0) throw new Error('page returned no content'); })()",
      },
    ],
  });

  try {
    const trace = await runFlow(checkFlow, { artifactsRoot: "public/artifacts", runId: randomUUID() });
    try {
      await mkdir(RUNS_DIR, { recursive: true });
      await writeFile(join(RUNS_DIR, `${trace.id}.json`), JSON.stringify(trace));
    } catch {
      /* persistence is best-effort */
    }
    return NextResponse.json(trace);
  } catch (e) {
    console.error("[api/flows/check] failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
