import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { createSession, closeSession } from "./firecrawl.js";
import { classify } from "./classify.js";
import { withTimeout } from "./timeout.js";
import type { Flow, Step, StepEvent, RunTrace, RunStatus } from "./types.js";

const DEFAULT_STEP_TIMEOUT_MS = 15_000;

export interface RunOptions {
  /** Where to write screenshots + DOM snapshots. Files are served by the API. */
  artifactsRoot: string;
  /** Stable id for this run (also the artifacts subdir + DB key). */
  runId: string;
  /** Resolve a secret name to its value (defaults to process.env). */
  resolveSecret?: (name: string) => string | undefined;
  /** Called every time a step or the run changes state, for live streaming. */
  onEvent?: (trace: RunTrace) => void;
  defaultStepTimeoutMs?: number;
  sessionTtlSeconds?: number;
}

/** Human label for a step, used in the trace viewer. */
function labelFor(step: Step): string {
  switch (step.type) {
    case "goto":
      return step.label ?? `Go to ${step.url}`;
    case "click":
      return step.label ?? `Click ${step.selector}`;
    case "fill":
      return step.label ?? `Fill ${step.selector}`;
    case "waitFor":
      return (
        step.label ??
        (step.selector ? `Wait for ${step.selector}` : `Wait ${step.ms}ms`)
      );
    case "scrollToBottom":
      return step.label ?? "Scroll to bottom";
    case "evaluate":
      return step.label ?? "Run script";
    case "expect":
      return step.label ?? `Expect ${step.selector}`;
  }
}

/** Display params with secrets redacted — secret values never enter the trace. */
export function redactParams(step: Step): Record<string, unknown> {
  const { type, label, timeoutMs, ...rest } = step as Record<string, unknown>;
  if (step.type === "fill") {
    const value =
      typeof step.value === "object" && "secret" in step.value
        ? `<secret:${step.value.secret}>`
        : step.value;
    return { selector: step.selector, value };
  }
  return rest;
}

/** Execute one step's browser action. Throws on failure; the caller classifies. */
async function execStep(
  page: Page,
  step: Step,
  timeoutMs: number,
  resolveSecret: (name: string) => string | undefined,
): Promise<void> {
  switch (step.type) {
    case "goto":
      await page.goto(step.url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
      return;
    case "click":
      await page.click(step.selector, { timeout: timeoutMs });
      return;
    case "fill": {
      const value =
        typeof step.value === "object" && "secret" in step.value
          ? resolveSecret(step.value.secret)
          : step.value;
      if (value === undefined) {
        throw new Error(
          `Secret "${(step.value as { secret: string }).secret}" is not set in the environment.`,
        );
      }
      await page.fill(step.selector, value, { timeout: timeoutMs });
      return;
    }
    case "waitFor":
      if (step.selector) {
        await page.waitForSelector(step.selector, { timeout: timeoutMs });
      } else if (step.ms) {
        await page.waitForTimeout(step.ms);
      }
      return;
    case "scrollToBottom":
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      return;
    case "evaluate":
      await page.evaluate(step.script);
      return;
    case "expect":
      await page.waitForSelector(step.selector, {
        timeout: timeoutMs,
        state: "visible",
      });
      return;
  }
}

/**
 * Run a flow against a fresh Firecrawl browser session, emitting a structured
 * trace. On the first failed step we capture a screenshot + DOM, classify the
 * reason, mark the remaining steps skipped, and stop — that single failed index
 * is the thing #7 asked for.
 */
export async function runFlow(flow: Flow, opts: RunOptions): Promise<RunTrace> {
  const resolveSecret = opts.resolveSecret ?? ((n) => process.env[n]);
  const stepTimeout = opts.defaultStepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const artifactsDir = join(opts.artifactsRoot, opts.runId);
  await mkdir(artifactsDir, { recursive: true });

  const steps: StepEvent[] = flow.steps.map((s, i) => ({
    index: i,
    type: s.type,
    label: labelFor(s),
    params: redactParams(s),
    status: "pending",
    attempt: 1,
  }));

  const trace: RunTrace = {
    id: opts.runId,
    flowName: flow.name,
    status: "running",
    startedAt: Date.now(),
    steps,
  };
  const emit = () => opts.onEvent?.(structuredClone(trace));
  emit();

  let browser: Browser | undefined;
  let sessionId: string | undefined;

  try {
    const session = await createSession({ ttlSeconds: opts.sessionTtlSeconds ?? 300 });
    sessionId = session.id;
    trace.sessionId = session.id;
    trace.liveViewUrl = session.liveViewUrl;
    emit();

    browser = await chromium.connectOverCDP(session.cdpUrl);
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    if (flow.startUrl) {
      await page.goto(flow.startUrl, { timeout: stepTimeout, waitUntil: "domcontentloaded" });
    }

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i]!;
      const event = steps[i]!;
      const budget = step.timeoutMs ?? stepTimeout;

      event.status = "running";
      event.startedAt = Date.now();
      emit();

      try {
        await withTimeout(
          execStep(page, step, budget, resolveSecret),
          budget + 1_000, // outer backstop slightly above the action budget
          event.label,
        );
        event.status = "passed";
        event.endedAt = Date.now();
        event.durationMs = event.endedAt - event.startedAt!;
        emit();
      } catch (err) {
        event.endedAt = Date.now();
        event.durationMs = event.endedAt - event.startedAt!;

        // Capture the page state at the moment of failure. DOM and screenshot
        // are captured independently so one failing doesn't lose the other, and
        // capture errors are surfaced (warned), never silently swallowed.
        const url = safeUrl(page);
        let html: string | undefined;
        let screenshotPath: string | undefined;
        let domSnapshotPath: string | undefined;

        try {
          html = await page.content();
          await writeFile(join(artifactsDir, `step-${i}.html`), html);
          domSnapshotPath = `/artifacts/${opts.runId}/step-${i}.html`;
        } catch (capErr) {
          console.warn(`[runner] DOM capture failed at step ${i}:`, (capErr as Error).message);
        }
        try {
          const shot = await captureScreenshot(page);
          await writeFile(join(artifactsDir, `step-${i}.png`), shot);
          screenshotPath = `/artifacts/${opts.runId}/step-${i}.png`;
        } catch (capErr) {
          console.warn(`[runner] screenshot failed at step ${i}:`, (capErr as Error).message);
        }

        const { reason, message } = classify(step, err, { html, url });
        event.status = "failed";
        event.failure = { reason, message, url, screenshotPath, domSnapshotPath };
        trace.failedStepIndex = i;

        // Everything after the failure never ran — say so explicitly.
        for (let j = i + 1; j < steps.length; j++) steps[j]!.status = "skipped";
        emit();
        break;
      }
    }

    trace.status = computeStatus(steps);
  } catch (err) {
    // Session/connection-level failure (couldn't even start driving).
    trace.status = "failed";
    if (trace.failedStepIndex === undefined && steps[0]) {
      steps[0].status = "failed";
      steps[0].failure = {
        reason: "unknown",
        message: `Could not start the browser session: ${(err as Error).message}`,
      };
      trace.failedStepIndex = 0;
    }
  } finally {
    trace.endedAt = Date.now();
    if (browser) await browser.close().catch(() => {});
    if (sessionId) await closeSession(sessionId);
    emit();
  }

  return trace;
}

/**
 * Capture the frame at the moment of failure. We go straight to CDP
 * (Page.captureScreenshot) because Playwright's page.screenshot() waits for the
 * page to settle and hangs on pages with ongoing animations/loaders — exactly
 * the pages that tend to fail. CDP grabs the current frame immediately. Falls
 * back to page.screenshot() if the CDP path is unavailable.
 */
async function captureScreenshot(page: Page): Promise<Buffer> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { data } = (await withTimeout(
      cdp.send("Page.captureScreenshot", { format: "png" }),
      8_000,
      "captureScreenshot",
    )) as { data: string };
    await cdp.detach().catch(() => {});
    return Buffer.from(data, "base64");
  } catch {
    return page.screenshot({ timeout: 5_000, animations: "disabled" });
  }
}

function safeUrl(page: Page): string | undefined {
  try {
    return page.url();
  } catch {
    return undefined;
  }
}

function computeStatus(steps: StepEvent[]): RunStatus {
  if (steps.some((s) => s.status === "failed")) {
    return steps.some((s) => s.status === "passed") ? "partial" : "failed";
  }
  return "passed";
}
