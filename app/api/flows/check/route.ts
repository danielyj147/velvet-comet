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
        // General signals only (no per-site rules): the goto step already fails on
        // HTTP 4xx/5xx; here we fail an obvious anti-bot/captcha challenge or a
        // genuinely empty response. Everything else "loaded" — and the final
        // snapshot (status, title, content snippet, screenshot) is captured so the
        // user can judge soft-blocks themselves rather than us guessing per site.
        script:
          "(() => {" +
          "  const html = document.documentElement.innerHTML.toLowerCase();" +
          "  if (/captcha|recaptcha|hcaptcha|verify you are human|are you a robot|unusual traffic|cf-challenge|cf-turnstile/.test(html)) throw new Error('bot/captcha challenge detected');" +
          "  const t = ((document.body && document.body.innerText) || '').trim();" +
          "  const title = (document.title || '').trim();" +
          "  if (t.length === 0 && title.length === 0) throw new Error('page returned no content');" +
          "})()",
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
