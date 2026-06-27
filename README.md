# Spectra — search that's actually complete

For work where **completeness is the product** — landscape reports, competitive
intelligence — a ranked list fails: raising the limit just returns more of the same
popular sites, and the trade pubs, regional press, and niche forums never surface at
any limit.

**Spectra mines for the long tail.** Each round it re-searches while *excluding every
domain it has already seen*, so new sources surface instead of more of the same — and
it keeps going until it has enough relevant results, the new sources dry up, or a
budget is hit. It shows, per round, how much new coverage it found.

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

`expand → [mine: search, excluding seen domains; repeat until target / plateau /
budget] → RRF fuse → dedup → rerank → diversify (MMR)`. The trace records new
relevant domains per round and why it stopped — so "how complete is this?" is a number,
not a guess. Diversity, dedup, and recall are all measurable; nothing claims to be magic.

## Layout

| Path | What |
| --- | --- |
| `searchtrace/` | the engine (mining loop, fuse, dedup, rerank, diversify) + CLI + sessions |
| `app/` | the studio (Next.js): sessions browser + ad-hoc search, ⌘K |
| `data/` | the brief's internal numbers |

## Notes

- `FIRECRAWL_API_KEY` via `.env` only (gitignored). No key in code or history.
- Models are opt-in (`EMBED_MODEL` / `EXPAND_MODEL`); unset → full lexical pipeline.
  The mining loop itself is AI-free (it's just `excludeDomains`).
