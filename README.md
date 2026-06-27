# Spectra — search that's actually complete

A raised result limit just returns more of the same popular sites. For work where
**completeness is the product** — landscape reports, competitive intelligence — that
fails: the trade pubs, regional press, and niche forums never surface at any limit,
and a flat ranked list gives you no way to see what was missed or why something
ranked.

**Spectra makes Firecrawl search observable and tunable.** A query runs a small
retrieval pipeline — widen coverage → fuse → de-duplicate → rank → diversify — and
every stage is on screen, so you can trust the result and tune it.

## Run it (under a minute)

```bash
make install
make env          # creates .env — add your FIRECRAWL_API_KEY
make dev          # app on http://localhost:8788
```

Open http://localhost:8788, search, and press **⌘K** to jump to any result. Quick
filters (sources, recency) are upfront; power knobs are under **More**; the full
pipeline is behind **how it works**; export any run as JSON.

Optional — semantic ranking via a local model (auto lexical fallback if absent):

```bash
make embeddings   # ollama pull nomic-embed-text   (then set EMBED_MODEL in .env)
```

## CLI

```bash
make search Q="competitive landscape fintech" ARGS="--tier thorough --diversity 0.5"
make test
make              # list all targets
```

## Layout

| Path | What |
| --- | --- |
| `searchtrace/` | the retrieval pipeline (expand · federate · RRF fuse · dedup · rerank · diversify) + CLI |
| `app/` | Next.js UI + API over it, with the ⌘K palette |
| `data/` | the brief's internal numbers (tickets, accounts) |

## Notes

- `FIRECRAWL_API_KEY` via `.env` only (gitignored). No key in code or history.
- Models are opt-in (`EMBED_MODEL` / `EXPAND_MODEL`); unset → full lexical pipeline.
  Deploy with `AI_DISABLED=1` to hard-disable the model path.
