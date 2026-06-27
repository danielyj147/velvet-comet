import { z } from "zod";

/**
 * The trace-event schema is the heart of tracewright. A Firecrawl browser flow
 * today returns ONE opaque error for a 14-step sequence. We re-express the flow
 * as a list of typed steps we drive ourselves, and emit one structured event per
 * step so the failure is never ambiguous: which step, why, and what the page
 * looked like at that moment.
 *
 * This file is imported by both the runner (Node) and the viewer (React), so the
 * shape is defined once and shared.
 */

// ---------------------------------------------------------------------------
// Flow definition (the declarative input)
// ---------------------------------------------------------------------------

/** A reference to a secret resolved from the environment at run time. The value
 *  is NEVER written into the flow file, the trace, or any prompt. This is the
 *  answer to "we are not putting customer passwords in a prompt" (feedback #11). */
export const secretRef = z.object({ secret: z.string().min(1) });
export type SecretRef = z.infer<typeof secretRef>;

const baseStep = z.object({
  /** Optional human label shown in the trace viewer. */
  label: z.string().optional(),
  /** Per-step time budget in ms. Defaults applied by the runner. */
  timeoutMs: z.number().int().positive().optional(),
});

export const step = z.discriminatedUnion("type", [
  baseStep.extend({ type: z.literal("goto"), url: z.string().url() }),
  baseStep.extend({ type: z.literal("click"), selector: z.string() }),
  baseStep.extend({
    type: z.literal("fill"),
    selector: z.string(),
    // value is either an inline literal or a secret reference (resolved from env)
    value: z.union([z.string(), secretRef]),
  }),
  baseStep.extend({
    type: z.literal("waitFor"),
    selector: z.string().optional(),
    ms: z.number().int().positive().optional(),
  }),
  baseStep.extend({ type: z.literal("scrollToBottom") }),
  baseStep.extend({ type: z.literal("evaluate"), script: z.string() }),
  /** Assert a condition holds (e.g. a post-login element). A failed expect is how
   *  we classify auth failures: login "succeeded" technically but the expected
   *  authenticated state never appeared. */
  baseStep.extend({
    type: z.literal("expect"),
    selector: z.string(),
    /** If present, treat a failure of this assertion as an auth failure. */
    meaning: z.enum(["auth"]).optional(),
  }),
]);
export type Step = z.infer<typeof step>;
export type StepType = Step["type"];

export const flow = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startUrl: z.string().url().optional(),
  steps: z.array(step).min(1),
});
export type Flow = z.infer<typeof flow>;

// ---------------------------------------------------------------------------
// Failure taxonomy (the grade — don't collapse everything to one error)
// ---------------------------------------------------------------------------

export const failureReason = z.enum([
  "selector_miss", // element not found / not visible within the step budget
  "timeout", // step exceeded its time budget (action or navigation)
  "navigation", // navigation failed or landed somewhere unexpected
  "captcha", // a captcha / challenge interstitial was detected
  "auth_fail", // login did not produce the expected authenticated state
  "rate_limit", // Firecrawl (or the target) returned 429 / rate-limit
  "blocked", // anti-bot / access-denied / 403-style block
  "js_error", // evaluate() threw
  "assertion", // an expect step's condition was false
  "unknown", // genuinely unclassified — surfaced honestly, not hidden
]);
export type FailureReason = z.infer<typeof failureReason>;

export const stepStatus = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof stepStatus>;

// ---------------------------------------------------------------------------
// Trace events (the output)
// ---------------------------------------------------------------------------

export const stepFailure = z.object({
  reason: failureReason,
  /** Short, human message. Selector and secret values are redacted upstream. */
  message: z.string(),
  /** URL the browser was on at the moment of failure. */
  url: z.string().optional(),
  /** Relative paths to the captured screenshot + DOM snapshot (served by the API). */
  screenshotPath: z.string().optional(),
  domSnapshotPath: z.string().optional(),
});
export type StepFailure = z.infer<typeof stepFailure>;

export const stepEvent = z.object({
  index: z.number().int().nonnegative(),
  // stored as a string; narrowed to StepType at the TS type level below
  type: z.string(),
  label: z.string(),
  /** Redacted params for display (no secret values, ever). */
  params: z.record(z.unknown()),
  status: stepStatus,
  attempt: z.number().int().positive().default(1),
  startedAt: z.number().int().optional(),
  endedAt: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  failure: stepFailure.optional(),
});
export type StepEvent = Omit<z.infer<typeof stepEvent>, "type"> & {
  type: StepType;
};

export const runStatus = z.enum(["running", "passed", "failed", "partial"]);
export type RunStatus = z.infer<typeof runStatus>;

export const runTrace = z.object({
  id: z.string(),
  flowName: z.string(),
  status: runStatus,
  /** Firecrawl session id + live view URL (embeddable read-only stream). */
  sessionId: z.string().optional(),
  liveViewUrl: z.string().optional(),
  startedAt: z.number().int(),
  endedAt: z.number().int().optional(),
  /** Index of the step that failed, if any — the one number the customer in #7
   *  said would cut their debugging time in half. */
  failedStepIndex: z.number().int().nonnegative().optional(),
  steps: z.array(stepEvent),
});
export type RunTrace = Omit<z.infer<typeof runTrace>, "steps"> & {
  steps: StepEvent[];
};
