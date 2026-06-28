# Spectra — search that's actually complete

For work where **completeness is the product** — landscape reports, competitive
intelligence — a ranked list fails: raising the limit just returns more of the same
popular sites, and the trade pubs, regional press, and niche forums never surface at
any limit.

**Spectra probes the topic many ways instead of reading one ranking deeper.** A bigger
limit is a *deeper single probe* (more of the same winners). Completeness comes from
*more, varied probes*: it searches the query's facets, then extracts the entities
(companies, products) from those results and searches each one within the topic — which
is what surfaces the regional outlet that covers *the company*, not the generic topic.
It keeps probing until it has enough relevant results, new sources dry up, or a budget
is hit, and shows how much new coverage each probe added.

It's built for the real use case (a nightly batch of thousands of queries): the **CLI**
is the primary surface, and a **studio** web UI browses the sessions the batch produced.

## Run it

```bash
make install
make env                       # creates .env — add your FIRECRAWL_API_KEY
make cli Q="competitive landscape: fintech fraud"
make cli ARGS="--help"         # all flags
```

Nightly batch (one query per line), then browse the results:

```bash
make batch FILE=queries.txt ARGS="--target 30"
make studio                    # http://localhost:8788 — scroll sessions, or search live
```

Every run is saved as a session in `./sessions/` (override with `SPECTRA_SESSIONS_DIR`);
the CLI and the studio share that folder. Press **⌘K** in the studio to jump anywhere.

Optional — semantic ranking via a local model (auto lexical fallback if absent):

```bash
make embeddings   # ollama pull nomic-embed-text   (then set EMBED_MODEL in .env)
```

## How completeness works

`expand → [facet probe → entity probes] → RRF fuse → dedup → rerank → diversify (MMR)`.
The decomposition (facets + topic-anchored entity sub-queries derived from the results)
is the recall engine; the trace records new relevant domains per probe round and why it
stopped — so "how complete is this?" is a number, not a guess. Recall, dedup, and
diversity are all measurable; nothing claims to be magic.

## Architecture

Frontend → backend → library. The studio (React) calls `/api/search` (a Next route
handler, server-side) which calls the shared `searchtrace` library; the CLI calls the
same library directly. Both go through one entrypoint (`searchtrace/run.ts`), so there's
no second copy of the logic, and the API key never leaves the server.

| Path | What |
| --- | --- |
| `searchtrace/` | the shared engine: decomposition, fuse, dedup, rerank, diversify, sessions, CLI |
| `app/` | the studio (Next.js): sessions browser + ad-hoc search, ⌘K — a thin client of the engine |
| `data/` | the brief's internal numbers |

## Notes

- `FIRECRAWL_API_KEY` via `.env` only (gitignored). No key in code or history.
- Models are opt-in (`EMBED_MODEL` / `EXPAND_MODEL`); unset → full lexical pipeline.
  The decomposition itself is AI-free (deterministic facets + entity extraction).
