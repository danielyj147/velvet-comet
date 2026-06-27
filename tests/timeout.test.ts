import { describe, it, expect } from "vitest";
import { withTimeout, StepTimeoutError } from "../src/timeout.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withTimeout — the bound that stops a hung step stalling the run", () => {
  it("resolves when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 50, "ok")).resolves.toBe(42);
  });

  it("rejects with StepTimeoutError when the deadline passes", async () => {
    const slow = sleep(100).then(() => "late");
    await expect(withTimeout(slow, 20, "slow step")).rejects.toBeInstanceOf(
      StepTimeoutError,
    );
  });

  it("propagates the original error if the work fails before the deadline", async () => {
    const boom = Promise.reject(new Error("real failure"));
    await expect(withTimeout(boom, 50, "x")).rejects.toThrow("real failure");
  });
});
