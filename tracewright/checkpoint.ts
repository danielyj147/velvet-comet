/**
 * Checkpoint 1 — validate the one assumption the whole design rests on:
 * can we open a Firecrawl Browser Sandbox session and drive it ourselves over CDP?
 *
 * If this passes, per-step timing / screenshots / DOM / classification are all ours.
 * If CDP is gated on our plan, we fall back to POST /v2/interact/{id}/execute.
 *
 * Run: npm run checkpoint
 */
import "dotenv/config";
import { chromium } from "playwright-core";
import { createSession, closeSession } from "./firecrawl.js";

async function main() {
  console.log("[checkpoint] creating Firecrawl browser session…");
  const session = await createSession({ ttlSeconds: 120 });
  console.log("[checkpoint] session:", {
    id: session.id,
    cdpUrl: session.cdpUrl.replace(/\?.*/, "?…"), // don't print any signed token
    liveViewUrl: session.liveViewUrl,
  });

  let browser;
  try {
    console.log("[checkpoint] connecting Playwright over CDP…");
    browser = await chromium.connectOverCDP(session.cdpUrl);
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    // Step A: a navigation that should succeed.
    console.log("[checkpoint] step A: goto example.com");
    await page.goto("https://example.com", { timeout: 20_000 });
    console.log("[checkpoint]   title:", await page.title());

    // Step B: force a failure (selector that doesn't exist) and prove we can
    // capture a screenshot + DOM at the moment of failure.
    console.log("[checkpoint] step B: click a selector that does not exist…");
    try {
      await page.click("#definitely-not-here", { timeout: 3_000 });
      console.log("[checkpoint]   UNEXPECTED: click succeeded");
    } catch {
      const shot = await page.screenshot();
      const html = await page.content();
      console.log(
        `[checkpoint]   captured failure state: screenshot ${shot.length} bytes, DOM ${html.length} chars, url ${page.url()}`,
      );
    }

    console.log("\n✅ CDP path works. Proceeding with the runner.");
  } finally {
    if (browser) await browser.close();
    await closeSession(session.id);
    console.log("[checkpoint] session closed.");
  }
}

main().catch((err) => {
  console.error("\n❌ checkpoint failed:", err.message);
  console.error(
    "If this is a CDP/connect error (not auth), we switch to the /execute fallback.",
  );
  process.exit(1);
});
