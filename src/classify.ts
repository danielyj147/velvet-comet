import type { FailureReason, Step } from "./types.js";
import { StepTimeoutError } from "./timeout.js";

/**
 * Failure classification — the part that turns "SCRAPE_FAILED" into a reason a
 * human can act on (feedback #7). We never collapse everything into one bucket;
 * "unknown" is a real, honestly-surfaced outcome, not a dumping ground.
 *
 * Two signal sources:
 *   1. the error thrown while driving the step (its kind + message)
 *   2. the DOM at the moment of failure (captcha / block interstitials show here
 *      even when the *symptom* was a selector miss)
 * Page state is checked first, because a captcha is the root cause even if what
 * we observed was "the button never appeared".
 */

const CAPTCHA_MARKERS = [
  "captcha",
  "recaptcha",
  "hcaptcha",
  "cf-challenge",
  "cf-turnstile",
  "verify you are human",
  "are you a robot",
  "unusual traffic",
];

const BLOCK_MARKERS = [
  "access denied",
  "access to this page has been denied",
  "you have been blocked",
  "request blocked",
  "403 forbidden",
  "permission to access",
  "enable javascript and cookies to continue",
];

export interface ClassifyContext {
  /** Lowercased DOM snapshot at the moment of failure, if we captured one. */
  html?: string;
  /** URL the browser was on when the step failed. */
  url?: string;
}

export interface Classification {
  reason: FailureReason;
  message: string;
}

function includesAny(haystack: string, needles: string[]): string | undefined {
  return needles.find((n) => haystack.includes(n));
}

export function classify(
  step: Step,
  error: unknown,
  ctx: ClassifyContext = {},
): Classification {
  const errMsg = error instanceof Error ? error.message : String(error);
  const html = (ctx.html ?? "").toLowerCase();

  // 0. Rate limiting is unambiguous from the error and worth its own bucket.
  if (/\b429\b|rate limit/i.test(errMsg)) {
    return {
      reason: "rate_limit",
      message: `Rate limit hit (429). The client backs off and retries; if it still surfaces, the plan's requests/min cap was exceeded: ${errMsg}`,
    };
  }

  // 1. Page-level blockers take precedence over the step-level symptom.
  const captcha = includesAny(html, CAPTCHA_MARKERS);
  if (captcha) {
    return {
      reason: "captcha",
      message: `Captcha / challenge detected on the page ("${captcha}"). The step couldn't proceed because the flow hit a human-verification wall.`,
    };
  }
  const blocked = includesAny(html, BLOCK_MARKERS);
  if (blocked) {
    return {
      reason: "blocked",
      message: `Anti-bot / access block detected ("${blocked}"). Consider a higher proxy tier for this domain.`,
    };
  }

  // 2. expect steps map to assertion / auth-failure regardless of error kind.
  if (step.type === "expect") {
    if (step.meaning === "auth") {
      return {
        reason: "auth_fail",
        message:
          "Login did not produce the expected authenticated state. Credentials were likely rejected, or a post-login redirect failed.",
      };
    }
    return {
      reason: "assertion",
      message: `Expected element "${step.selector}" was not present, so the assertion failed.`,
    };
  }

  // 3. evaluate() that throws is a JS error in the injected script.
  if (step.type === "evaluate") {
    return {
      reason: "js_error",
      message: `Injected script threw: ${errMsg}`,
    };
  }

  // 4. Timeouts: our own budget, or Playwright's internal action/nav timeout.
  const isTimeout =
    error instanceof StepTimeoutError ||
    (error instanceof Error && error.name === "TimeoutError") ||
    /timeout|timed out|exceeded/i.test(errMsg);

  if (isTimeout) {
    // A goto/navigation timeout is a navigation problem; an action timeout on a
    // selector almost always means the element never showed up.
    if (step.type === "goto") {
      return {
        reason: "navigation",
        message: `Navigation to the target URL did not complete in time: ${errMsg}`,
      };
    }
    if (step.type === "waitFor" && step.ms && !step.selector) {
      return {
        reason: "timeout",
        message: `Fixed wait of ${step.ms}ms elapsed without the step budget allowing continuation.`,
      };
    }
    return {
      reason: "selector_miss",
      message: `Element for this step never became available within the time budget (selector likely changed or the page wasn't ready): ${errMsg}`,
    };
  }

  // 5. Playwright "no element / not visible / detached" without a timeout.
  if (/no element|not visible|element is not|detached|not found/i.test(errMsg)) {
    return {
      reason: "selector_miss",
      message: `Target element could not be acted on (missing, hidden, or detached): ${errMsg}`,
    };
  }

  // 6. goto resolution / net errors.
  if (step.type === "goto" && /net::|err_|navigat/i.test(errMsg)) {
    return {
      reason: "navigation",
      message: `Navigation failed: ${errMsg}`,
    };
  }

  return {
    reason: "unknown",
    message: `Unclassified failure: ${errMsg}`,
  };
}

/** Classify an infrastructure-level error (session creation / CDP connect) that
 *  happens before we have a page or a specific step to blame. */
export function classifyInfra(error: unknown): Classification {
  const m = error instanceof Error ? error.message : String(error);
  if (/\b429\b|rate limit/i.test(m))
    return { reason: "rate_limit", message: `Could not start the browser session — rate limited (429). ${m}` };
  if (/timed out|timeout/i.test(m))
    return { reason: "timeout", message: `Could not start the browser session — timed out. ${m}` };
  return { reason: "unknown", message: `Could not start the browser session: ${m}` };
}
