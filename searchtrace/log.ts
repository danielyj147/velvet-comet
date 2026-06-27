/**
 * Tiny structured logger. Latency is the thing we most want to see (the brief's
 * #8 is all about it, and "is it slow?" is the first question of any search
 * product), so timings are logged per stage and as a total. Lines are key=value
 * so they're greppable and parse cleanly in server logs.
 */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  const parts = Object.entries(fields).map(
    ([k, v]) => `${k}=${typeof v === "number" || typeof v === "boolean" ? v : JSON.stringify(v)}`,
  );
  console.log(`[searchtrace] ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}
