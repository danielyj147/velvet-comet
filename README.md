# Firecrawl Traces — make the opaque legible

A Firecrawl operation that fails or under-delivers usually comes back as a black
box: one error, or one ranked list with no idea *why*. This project turns that black
box into a **trace** — every stage and every result, with the reason it's there and
what to do next — across two surfaces that share the same idea:

- **`searchtrace/` → `/search`** — an observable **retrieval pipeline** over
  Firecrawl search: `expand → federate → RRF fuse → embed → dedup → rerank →
  precision gate → MMR diversify`. Recall *and* precision you can see, with
  per-result provenance and a coverage panel. (Built for the Search role; serves
  customer asks #1 completeness, #5 intent/rerank, #4 latency tiers.)
- **`tracewright/` → `/flows`** — step-level observability for **browser flows**:
  which step failed, why, and what the page looked like — not one opaque
  `SCRAPE_FAILED`. (Serves #7 and #11.)

`app/` is one Next.js app over both, with a global **⌘K** command palette. Why this
shape: see [`narratives/08-the-search-rethink.md`](./narratives/08-the-search-rethink.md)
and [`ONEPAGER.md`](./ONEPAGER.md).

## Run it (under a minute)

```bash
make install
make env          # creates .env — add your FIRECRAWL_API_KEY
make dev          # Next app on http://localhost:8788
```

Open http://localhost:8788 → **Search** and **Flows**. Press **⌘K** anywhere to
search results, jump, or toggle settings.

Optional — semantic search (better precision/dedup/diversity) via a local model:

```bash
make embeddings   # ollama pull nomic-embed-text  (auto lexical fallback if absent)
```

## CLIs (same logic, headless)

```bash
make search Q="small business accounting software" ARGS="--tier thorough --diversity 0.5"
make flow-demo FLOW=flows/vendor-portal-broken.json
make checkpoint   # validate the Firecrawl CDP connection (1 short session)
make test         # failure-path + IR unit tests
make              # list all targets
```

## Layout

| Path | What |
| --- | --- |
| `searchtrace/` | retrieval pipeline (expand, federate, fuse, dedup, rerank, diversify, embeddings) + CLI |
| `tracewright/` | browser-flow runner, failure classifier, CDP session client + CLIs |
| `app/` | shared Next.js UI + API over both, with the ⌘K palette |
| `flows/` | example declarative browser flows |
| `narratives/` | newcomer→staff guide to Firecrawl + the search direction |

## Notes & secrets

- `FIRECRAWL_API_KEY` via `.env` only (gitignored). No key in code or history.
- Embeddings/expansion models are optional and local (Ollama); set `EMBED_MODEL` to
  use a different one. Everything falls back to a lexical path without them.
- Each demo run costs Firecrawl credits; the search `thorough` tier fans out more.
- [`NOTES.md`](./NOTES.md) logs gotchas; [`CHANGELOG.md`](./CHANGELOG.md) tracks changes.
