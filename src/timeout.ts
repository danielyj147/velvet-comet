/** Our own per-step timeout, distinct from Playwright's internal action timeouts. */
export class StepTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepTimeoutError";
  }
}

/**
 * Race a promise against a hard deadline. Every external/browser call in the
 * runner is wrapped in this so a single hung step can never stall the whole run
 * (the failure mode feedback #8 explicitly mocks).
 */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new StepTimeoutError(`${label} exceeded ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
