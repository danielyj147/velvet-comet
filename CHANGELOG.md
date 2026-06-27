# Changelog

All notable changes to this take-home build. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This is a 72h project, so the
log is chronological and honest rather than versioned.

## [Unreleased]

### Added
- **Project direction chosen:** Direction A — step-level observability for
  Firecrawl browser flows (serves feedback #7 "which step failed" and #11
  authenticated multi-step sessions). Backed by the data: "error confusion /
  debugging help" is the #1 support category (214/90d, 38%).
- **Scaffold:** TypeScript end-to-end, `playwright-core` (connect-only, no local
  browser download), zod schemas, `.env`-based secrets with `.env.example`.
- **Trace-event schema** (`src/types.ts`): declarative flow + structured
  per-step trace with an explicit failure taxonomy. Shared by runner and viewer.
- **Firecrawl session client** (`src/firecrawl.ts`): create/close Browser
  Sandbox sessions over REST, returns the `cdpUrl`; all calls timeout-bounded.
- **Checkpoint 1:** validated the core bet — drive a Firecrawl session ourselves
  via `chromium.connectOverCDP(cdpUrl)`, capture a screenshot on a forced fail.
- **Step runner + classifier** (`src/runner.ts`, `src/classify.ts`): runs a flow
  step-by-step, bounds each step, captures screenshot + DOM at the failure frame,
  classifies the reason, records `failedStepIndex`, marks later steps skipped.
  Secrets injected via Playwright `fill()` (never a prompt) and redacted.
- **CLI surface** (`npm run demo`): readable live trace in the terminal.
- **Trace store** (`src/store.ts`): single-table `better-sqlite3` blob store
  (deliberately not Prisma — nothing to normalize).
- **API + viewer** (`src/server.ts`, `web/`): Express endpoints to list flows,
  start runs, poll traces, serve artifacts; React trace viewer with live step
  timeline, failure panel (reason + screenshot + DOM), and re-run. Plain React +
  fetch polling (deliberately not TanStack — one polled endpoint, a simple list).

- **Tests** (19): failure classification, the per-step timeout bound, secret
  redaction, and store upsert/list — the parts that fail in the real world.
- **Docs:** `README.md` (run steps), `ONEPAGER.md` (the weighted deliverable),
  `NARRATIVE.md` (problem→solution arc for the call), `NOTES.md`, `CHANGELOG.md`.
  Original brief preserved as `BRIEF.md`.
- **`narratives/`** — an 8-part learning narrative set on Firecrawl (history,
  the web-data problem space + SOTA, the primitives, interaction/CDP, agents &
  extraction, architecture, and staff-round synthesis). Newcomer-friendly but
  deep; verifiable facts separated from marketing throughout. Built from
  multi-source research (history, problem-space/SOTA, architecture from the repo).

### Changed
- Extracted `withTimeout` + `StepTimeoutError` into `src/timeout.ts` so the
  deadline is unit-testable without a browser.
- `goto` now waits for `load` (not `domcontentloaded`) so page scripts are ready.
- Click steps assert visibility then `dispatchEvent("click")` — coordinate clicks
  silently no-op on the hosted browser after a navigation (see NOTES #2).
- Added `rate_limit` to the failure taxonomy; session client retries 429/408/5xx
  with bounded backoff + jitter (4xx terminal); session-level errors classified
  via `classifyInfra`. (see NOTES #3)

### Fixed
- Failure-capture swallowed errors and hung on animated pages. Now DOM and
  screenshot are captured independently with loud warnings, and the failure frame
  is grabbed via raw CDP `Page.captureScreenshot`. See `NOTES.md`.

### Security
- Hardened `.gitignore` to ignore all `.env*` except the template, after a real
  key was briefly placed in a tracked file. Key confirmed absent from history.

### Deliberately not built (so far)
- Partial "retry from step N" replay (full re-run covers the demo; ephemeral
  sessions make mid-session resume dishonest).
- Anything for feedback #1/#4/#5/#10 etc. — out of the chosen scope.
