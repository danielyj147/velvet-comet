import { describe, it, expect } from "vitest";
import { classify, classifyInfra } from "../src/classify.js";
import { StepTimeoutError } from "../src/timeout.js";
import type { Step } from "../src/types.js";

const click: Step = { type: "click", selector: "#go" };
const goto: Step = { type: "goto", url: "https://example.com" };
const evaluate: Step = { type: "evaluate", script: "boom()" };
const expectAuth: Step = { type: "expect", selector: ".dash", meaning: "auth" };
const expectPlain: Step = { type: "expect", selector: ".dash" };

describe("classify — failure taxonomy", () => {
  it("treats a captcha in the DOM as the root cause, over the step symptom", () => {
    const c = classify(click, new StepTimeoutError("x exceeded 3000ms"), {
      html: "<html>Please complete the reCAPTCHA to continue</html>",
    });
    expect(c.reason).toBe("captcha");
  });

  it("detects anti-bot blocks in the DOM", () => {
    const c = classify(goto, new Error("nav"), {
      html: "<title>Access Denied</title>",
    });
    expect(c.reason).toBe("blocked");
  });

  it("maps a failed auth expectation to auth_fail", () => {
    const c = classify(expectAuth, new Error("not found"));
    expect(c.reason).toBe("auth_fail");
  });

  it("maps a plain failed expectation to assertion", () => {
    const c = classify(expectPlain, new Error("not found"));
    expect(c.reason).toBe("assertion");
  });

  it("maps an evaluate throw to js_error", () => {
    const c = classify(evaluate, new Error("ReferenceError: boom"));
    expect(c.reason).toBe("js_error");
    expect(c.message).toContain("boom");
  });

  it("maps a click timeout to selector_miss (element never appeared)", () => {
    const c = classify(click, new StepTimeoutError("Click #go exceeded 5000ms"));
    expect(c.reason).toBe("selector_miss");
  });

  it("maps a goto timeout to navigation", () => {
    const c = classify(goto, new StepTimeoutError("goto exceeded 15000ms"));
    expect(c.reason).toBe("navigation");
  });

  it("maps a Playwright 'no element' error to selector_miss", () => {
    const c = classify(click, new Error("locator: no element matches selector"));
    expect(c.reason).toBe("selector_miss");
  });

  it("maps net errors on goto to navigation", () => {
    const c = classify(goto, new Error("net::ERR_NAME_NOT_RESOLVED"));
    expect(c.reason).toBe("navigation");
  });

  it("classifies a 429 as rate_limit, ahead of other signals", () => {
    const c = classify(click, new Error("Firecrawl /v2/interact -> 429: Rate limit exceeded"));
    expect(c.reason).toBe("rate_limit");
  });

  it("falls back to unknown honestly rather than mislabeling", () => {
    const c = classify(click, new Error("something we did not anticipate"));
    expect(c.reason).toBe("unknown");
    expect(c.message).toContain("something we did not anticipate");
  });
});

describe("classifyInfra — session-level failures (before any step)", () => {
  it("maps a 429 session-create failure to rate_limit", () => {
    expect(classifyInfra(new Error("... -> 429: Rate limit exceeded")).reason).toBe(
      "rate_limit",
    );
  });
  it("maps a session timeout to timeout", () => {
    expect(classifyInfra(new Error("Firecrawl /v2/interact timed out after 30000ms")).reason).toBe(
      "timeout",
    );
  });
  it("falls back to unknown otherwise", () => {
    expect(classifyInfra(new Error("weird")).reason).toBe("unknown");
  });
});
