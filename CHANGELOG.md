# Changelog

All notable changes to this take-home build. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This is a 72h project, so the
log is chronological and honest rather than versioned.

## [Unreleased]

### Added — pluggable AI providers + LLM entity probes + clean-slate setup (latest)
- **Three providers, all opt-in:** Anthropic (Claude), OpenAI, or local Ollama — for
  query expansion and entity probes; OpenAI/Ollama also do embeddings (Anthropic has
  none). One `chat()` dispatch (`llm.ts`) + provider-resolved embeddings; `config.ts`
  resolves provider by `LLM_PROVIDER` else anthropic > openai > ollama. Everything
  fails soft to the lexical path, so a fresh clone still runs on a Firecrawl key alone.
- **LLM-assisted entity probes:** when AI is on, an LLM names the entities to probe
  (sharper than the heuristic); falls back automatically. (`decompose.deriveEntities`)
- **Clean-slate setup:** `make models` → `scripts/setup-ollama.sh` installs Ollama,
  starts it, pulls a small embed + chat model, and prints the `.env` lines. README has
  a clean-machine "turn on AI" section; `.env.example` documents all three providers.
- Studio AI toggle shows the resolved provider (Claude / OpenAI / Ollama).

### Changed — recall engine: decomposition, not domain-exclusion
- **Replaced `excludeDomains` mining with query decomposition.** The root cause is that
  one query is a single narrow probe; excluding domains only walks the *same* head-heavy
  ranking deeper. Now: round 1 probes the **facets** (query + expansions); later rounds
  extract **entities** (companies/products) from the results so far and probe each one,
  **anchored to the topic** so a noisy entity ("Crayon") can't drift off-topic
  (→ crayola.com). Entities come from the topic's own results, so it's generic across
  clients and AI-free. Verified: entity probes added +23 on-topic distinct domains over
  the facet round; drift eliminated by anchoring.
- New `searchtrace/decompose.ts` (entity extraction). `MiningRound` now carries
  `kind: facet|entity` + the sub-queries; the studio shows coverage-by-probe.
- **One orchestration entrypoint** `searchtrace/run.ts` (`runAndSave`) — the CLI and the
  API route are now thin adapters over it; the zod schema is the single source of
  defaults (the CLI no longer re-states them). Frontend → backend → shared library.

### Added — adaptive completeness engine + CLI/studio surface
- **Adaptive completeness loop (#1):** each round re-searches a query variant while
  `excludeDomains = all domains seen so far` — the AI-free move that forces the long
  tail (trade pubs, regional press) to surface instead of "more of the same". Stops at
  the relevant-results target, a new-domain plateau, or the round budget; the trace
  reports per-round new-domain growth and the stop reason. Verified: niche domains
  surface across rounds where a bigger limit never would.
- **CLI is the primary surface** (`spectra` / `make cli` / `make batch`) — built for
  the customer's nightly batch of thousands of queries: one query or `--batch file`,
  bounded concurrency, full `--help`. Every run writes a **session**.
- **Sessions = a folder of JSON** (`searchtrace/sessions.ts`, default `./sessions`,
  `SPECTRA_SESSIONS_DIR` to override) — no DB; CLI and studio share it.
- **Studio** (`make studio`) — Prisma-Studio-style: a scrollable sessions sidebar
  (newest first) browsing whatever the batch wrote, plus "New search" to run ad-hoc
  and save. New `/api/sessions` + `/api/sessions/[id]`; live search now persists.
- Removed the old single-pane demo CLI; `targetResults`/`maxRounds` knobs added.


### Removed / Changed — cut intent, user-first UX (latest)
- **Cut the intent feature entirely** (may revisit). Reordering by a heuristic
  criterion was hard to verify; tightening the core (observable hybrid retrieval —
  recall, precision, dedup, diversity, all measurable) matters more. Removed
  `searchtrace/intent.ts`, the rank-by stage, the `intent`/`rankScore` fields, the
  intent UI, and its tests. MMR ranks on relevance again.
- **User-first search UX:** clean search bar + plain-language quick filters
  (sources, recency); all power knobs (depth, diversity, min-relevance, categories,
  niche domains, content/maxAge, AI) tucked behind **More**. A plain-language
  coverage strip ("N results · searched M lists · merged K duplicates · D domains")
  is always visible; the full pipeline funnel + hints are behind **how it works**;
  per-result signals fold away under "why this result". Narrower column, calmer page.
- Readability: extracted small components (Chip/Advanced/CoverageStrip/Inspect/Why),
  simplified the BM25 scorer, removed dead params.

### Changed — narrowed to one problem
- **Refocused the submission on a single problem** (the brief's whole point): search
  ranking is generic + opaque, so customers rebuild reranking themselves (#5).
  Rewrote `ONEPAGER.md` to claim ONE problem, with intent ranking / hybrid relevance
  / freshness / dedup / diversity / the trace as *depth* on it — not separate wins.
- **Flows reframed as secondary** — kept in the app, but explicitly a 1-line aside
  ("the same observability idea on the scrape surface"), not a co-headline.
- **Stopped chasing soft-block detection** (LinkedIn login walls): reliably catching
  them is the anti-bot arms race, an explicit anti-goal. Best-effort captcha/login
  detection only; the limitation is documented, not hidden.

### Added — intent-aware ranking (#5) + freshness controls
- **`intention` field (#5):** auto / news / research / buying / jobs. Changes the
  ranking criterion (news=freshness, research=authority, buying=comparison,
  jobs=recency), inferred from the query on `auto`, and steers retrieval (news adds
  the news source + recency). The intent stage blends an interpretable intent score
  into the MMR order; results show a per-result intent factor badge. Heuristic
  classifier — works with no model. This closes the pitch-vs-code gap from the
  scorecard (rerank was generic; now it's genuinely intent-aware).
- **Freshness, correctly:** `recency` → Firecrawl `tbs` (result age). `maxAge` →
  `scrapeOptions` behind a "fetch content" toggle (cached-content freshness — it's a
  scrape param, not a top-level search param; see NOTES #4). Fetched content also
  enriches ranking.
- **Export button** — download any search trace as JSON.
- **One-pager repositioned:** leads with #5, names `/agent` honestly, frames
  completeness as a cheaper batch mode, and is straight about #3/#4. Intent unit
  tests added (32 total).

### Added — check-a-page, de-brand, holo readability
- **Flows = check any page:** paste a URL → we drive a real browser to it and show
  **pass/fail** with a verdict banner; failures are classified (navigation / timeout
  / blocked / captcha) via the same taxonomy. Ties Flows to scraping and gives a
  live failure demo. (`/api/flows/check`; lenient content rule so thin-but-valid
  pages don't false-fail.)
- **De-branded for public hosting:** product renamed **Spectra** with a custom
  spectrum favicon (`app/icon.svg`); the live UI no longer carries the Firecrawl
  name or internal ticket numbers (those stay in the repo docs / submission).
- **Holographic cards rewritten for readability:** effect layers sit *behind* the
  content (text always crisp); faithful pointer-driven foil + glare (original
  implementation of the technique, not lifted source); tilt made more dramatic (16°).
- **`narratives/09-the-eleven-evaluated.md`** — a scorecard of all 11 asks
  (duplication risk, leverage, effort, verdict, honest coverage).

### Added — saved runs, search failures, palette + holo polish
- **Flows show a saved failure by default** — a committed example run
  (`tracewright/seed-run.json` + screenshot in `public/seed/`) renders instantly,
  so a reviewer sees the exact failed step without a live, credit-costing run.
  Live runs now **persist** (`data/flow-runs/`) and appear in a "Saved runs" list;
  `/api/flows/runs` serves seed + persisted, newest first.
- **Search failures are classified** — a failure card with a kind
  (rate_limit / timeout / auth / network) and an actionable hint, not a raw string.
- **⌘K: Shift+Enter runs a search** (the registered primary action; falls back to
  navigating to /search).
- **Holographic cards toned down** — subtle pointer glare + a fine **glitter** field
  near the cursor (no more full rainbow), plus a quick **sparkle-burst on click**.

### Added — AI toggle + deploy guard
- **AI toggle** in the search UI (embeddings + LLM expansion on/off), with a
  matching ⌘K command. Default OFF — the fast lexical path is the first experience.
- **Deploy guard:** `AI_DISABLED=1` (or no models configured) greys out the toggle
  with a tooltip explaining why; the server refuses to use models regardless of the
  request. `/api/config` is the single source of truth the UI reads.
- Pipeline gained a `useModels` flag (skips the embed stage + forces heuristic
  expansion when off); CLI `--no-ai`.

### Fixed
- **Hydration mismatch** in `Bubbles`: randomness now generated after mount
  (client-only) instead of during render, so SSR/CSR agree.

### Added — the magical UX
- **Tailwind v4 + shadcn-style components** (Button, Badge, Dialog, Checkbox,
  Slider) on Radix; `cn()` util; dark warm theme tokens.
- **Holographic cards** (`HoloCard`) — pointer-tracked 3D tilt + spectral sheen
  (Pokémon-card style) on home and search results.
- **Ambient bubbles** background — blurred circles drifting up at random sizes/
  speeds; respects `prefers-reduced-motion`.
- **Natural onboarding** — a first-visit overlay that fades in after the page
  settles, with "don't show again" (localStorage); never a hard block.
- **Show-don't-tell home** — minimal hero, two cards, ⌘K hint; the problem +
  evidence (ticket stats, role) tucked behind a one-click "Why this exists".
- **Per-result signal breakdown** in search (BM25 · semantic · consensus bars) so
  the hybrid ranking is legible at a glance.
- Restyled ⌘K palette, search, and flows with the new system.

### Added — unified app + hybrid search
- **One Next.js app over both products** (`app/`): routes `/search` and `/flows`,
  API routes calling the shared libs, and a global **⌘K** command palette (search
  results, jump, toggle settings, navigate). Replaced the two standalone Express
  servers + the Vite SPA — one product surface, two trace views. Renamed `src/` →
  `tracewright/` and folded its CLIs in, so the products are siblings.
- **Hybrid retrieval** in searchtrace: in-memory **BM25** (no DB — ephemeral
  per-query pool) ⊕ **dense embeddings** ⊕ **source-consensus**, fused by RRF into
  the relevance score (with a per-result signal breakdown for the UI).
- **LLM query expansion** (DeepSeek-R1 via Ollama) for the `thorough` tier — real
  sub-question decomposition; deterministic heuristic for `balanced`.
- **Models are opt-in:** the semantic/LLM path activates only when `EMBED_MODEL` /
  `EXPAND_MODEL` are set (Qwen3-Embedding-8B, DeepSeek-R1-14B). A fresh clone runs
  the full lexical path (BM25 + heuristic) with just a Firecrawl key — reviewer-
  friendly and deployable as a live link.
- **Structured, time-focused logging** (`searchtrace/log.ts`): per-stage latency,
  a timing breakdown, and a `search.done` summary.
- **IR unit tests** (BM25 ranking + idf, URL canonicalization, RRF fusion).

### Added — searchtrace (the Search-role pivot)
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

### Added — searchtrace (the Search-role pivot)
- **`searchtrace/`** — an observable retrieval pipeline over Firecrawl `/v2/search`:
  `expand → federate → RRF fuse → dedup → rerank(relevance) → precision gate → MMR
  diversify`. Recall via query expansion + multi-source/domain federation + RRF;
  precision via relevance scoring (consensus + topical) and an opt-in gate;
  diversity via MMR (domain + content). The trace is the product: per-stage funnel,
  per-result provenance (RRF rank, cross-query agreement, merges), coverage panel
  (recall/precision/diversity index), and plain-language hints. Latency tiers
  `fast|balanced|thorough`. CLI: `npm run search:demo` / `make search Q=...`.
- **Semantic stages via local Ollama** (`searchtrace/embeddings.ts`,
  `nomic-embed-text`): cosine relevance/dedup/MMR when available, robust across
  `/api/embed` and `/api/embeddings`, with automatic lexical fallback.
- **`Makefile`** — one entry point for both products (install/env/test/demo/search/…).
- **`CLAUDE.md`** updated for the Search-role target, the two-product layout, and the
  pivot; original brief lives in `BRIEF.md`.

### Deliberately not built (so far)
- Partial "retry from step N" replay (full re-run covers the demo; ephemeral
  sessions make mid-session resume dishonest).
- Anything for feedback #1/#4/#5/#10 etc. — out of the chosen scope.
