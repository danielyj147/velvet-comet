import { describe, it, expect } from "vitest";
import { redactParams } from "../tracewright/runner.js";
import type { Step } from "../tracewright/types.js";

describe("redactParams — secret values must never enter the trace", () => {
  it("replaces a secret-ref fill value with a placeholder, not the value", () => {
    const step: Step = {
      type: "fill",
      selector: "#password",
      value: { secret: "DEMO_PASSWORD" },
    };
    const out = redactParams(step);
    expect(out.value).toBe("<secret:DEMO_PASSWORD>");
    // the actual env value must not be serialized anywhere in the params
    expect(JSON.stringify(out)).not.toContain(process.env.DEMO_PASSWORD ?? "__unset__");
  });

  it("keeps an inline (non-secret) fill value visible for debugging", () => {
    const step: Step = { type: "fill", selector: "#q", value: "hello" };
    expect(redactParams(step).value).toBe("hello");
  });

  it("does not leak step type/label/timeout into params", () => {
    const step: Step = {
      type: "click",
      selector: "#go",
      label: "Click go",
      timeoutMs: 1000,
    };
    const out = redactParams(step);
    expect(out).toEqual({ selector: "#go" });
  });
});
