# tracewright

**Step-level observability for Firecrawl browser flows.** A multi-step browser
automation on Firecrawl that breaks today comes back as one opaque
`SCRAPE_FAILED`. tracewright runs the same flow step-by-step and tells you
**which step failed, why, and what the page looked like at that moment** — with a
screenshot, a DOM snapshot, and a classified failure reason.

Built for a Firecrawl take-home. Addresses customer feedback **#7** ("tell me
which step failed and what the page looked like") and **#11** (authenticated
multi-step sessions, credentials, login-failure semantics). These map to the #1
support category in the internal data: *error confusion / debugging help* (214 of
~565 tickets in 90 days). See [`NARRATIVE.md`](./NARRATIVE.md) for the full
reasoning and [`ONEPAGER.md`](./ONEPAGER.md) for the summary.

## How it works

Firecrawl's Browser Sandbox session (`POST /v2/interact`) returns a `cdpUrl`. We
connect Playwright to that hosted browser over CDP and drive a declarative flow
ourselves — so Firecrawl owns the real anti-bot browser, and we own per-step
timing, screenshots, DOM capture, and failure classification.

## Run it (under a minute)

```bash
npm install
cp .env.example .env          # then put your Firecrawl key in .env
```

**CLI** — fastest way to see a trace:

```bash
npm run demo                  # runs flows/vendor-portal-broken.json
npm run demo flows/vendor-portal.json
```

**Web viewer** — the real surface:

```bash
npm run build:web             # build the React viewer
npm run server                # serves UI + API on http://localhost:8787
```

Open http://localhost:8787, pick a flow, hit **Run**, and watch the step timeline
fill in live. A failed step expands to its reason, screenshot, and DOM snapshot.

> Dev mode (hot reload): run `npm run server` and `npm run web` in two terminals;
> the Vite dev server on :5173 proxies `/api` and `/artifacts` to the API.

## Flows

A flow is a declarative JSON file in [`flows/`](./flows): a list of typed steps
(`goto`, `click`, `fill`, `waitFor`, `evaluate`, `expect`). Secrets are referenced
by name and injected via Playwright `fill()` — never sent as a prompt, never
written to the trace:

```json
{ "type": "fill", "selector": "#password", "value": { "secret": "DEMO_PASSWORD" } }
```

Shipped flows: `vendor-portal` (passes), `vendor-portal-broken` (selector drift →
`selector_miss` at step 7), `login-bad-creds` (wrong password → `auth_fail`).

## Failure taxonomy

`selector_miss` · `timeout` · `navigation` · `captcha` · `auth_fail` · `blocked` ·
`js_error` · `assertion` · `unknown`. Page-level blockers (captcha/anti-bot) take
precedence over the step-level symptom. `unknown` is surfaced honestly, never a
catch-all.

## Tests

```bash
npm test        # 19 tests: classification, timeout bound, secret redaction, store
npm run typecheck
```

Tests target the parts that fail in the real world (classification, the timeout
bound, secret redaction), not the happy path.

## Layout

| Path | What |
| --- | --- |
| `src/types.ts` | shared flow + trace-event schema (the core IP) |
| `src/firecrawl.ts` | Browser Sandbox session client (create/close, `cdpUrl`) |
| `src/runner.ts` | drives steps over CDP, captures + classifies failures |
| `src/classify.ts` | failure taxonomy |
| `src/store.ts` · `src/server.ts` | SQLite trace store + Express API |
| `web/` | React trace viewer |
| `flows/` | example declarative flows |

## Notes & secrets

- `FIRECRAWL_API_KEY` via `.env` only (gitignored). No key in code or history.
- Each run uses one short Browser Sandbox session (~5–20s). Be mindful of credits.
- [`NOTES.md`](./NOTES.md) logs gotchas; [`CHANGELOG.md`](./CHANGELOG.md) tracks
  changes.
