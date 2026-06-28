# Spectra — one-pager

## The problem

One customer states it cleanly (call #1, enterprise, renewal this quarter): *"the
landscape reports go straight to our clients, so completeness is the product."* They
run search at `limit: 50` and their analysts **still** hand-find sources afterward —
trade pubs, regional press, niche forums. And the key detail: *"going from ten to
fifty mostly gave us forty more of the same SEO winners. The sources we actually miss
don't show up at any limit."*

That's the real shape of the problem, and it's why a bigger `limit` can't fix it. A
search engine's ranking is **head-heavy** — it returns the popular, well-SEO'd domains
first. Raising the limit walks *deeper into the same ranked list* (more pages from the
same winners); it never walks *wider* into the long tail. The sources they need are
below the fold of the underlying engine and simply never come back. (They also note the
deprecated deep-research endpoint "was closer to right" — because it did more than
re-rank one list.) These are overnight batch jobs — "make it ten times slower, I don't
care" — so the constraint isn't latency; it's coverage.

## What I built

**Spectra probes the topic many ways instead of reading one ranking deeper.** A single
query is one narrow probe of a topic's source space; a bigger limit just reads it deeper.
Completeness needs *more, varied probes* — which is the deterministic, search-native
version of the "deep research" the customer missed:

> Search the query's **facets** (the query + expansions). Then extract the **entities**
> (companies, products, people) from those results and search each one *within the
> topic* — because a regional outlet covers "Acme Corp", not "competitive landscape of
> fraud detection". Repeat the entity probes until there are enough relevant results,
> until a probe stops finding new sources, or until the round budget is hit.

The entity sub-queries are derived from the topic's **own results**, so this generalizes
to any topic/client with no per-topic config, and it's AI-free. The full pipeline is
`expand → facet probe → entity probes → RRF fuse → de-duplicate → rerank → diversify
(MMR)`, and the **trace makes it legible**: new relevant domains per probe, and *why* it
stopped (target / plateau / budget). Recall, dedup, and diversity are all measurable.

The **surface matches the customer's reality** — a nightly batch of thousands of
queries, not a person at a form:

- The **CLI is primary**: `spectra "query"` or `spectra --batch queries.txt` with
  bounded concurrency and a real `--help`. Every run is saved as a **session** (a JSON
  file in a folder — no database).
- A **studio** (`make studio`), Prisma-Studio style, browses those sessions — a
  scrollable list of what the batch produced — and runs ad-hoc searches that save back
  to the same folder.

## What I deliberately didn't build, and why

This is the point of the exercise — I cut hard to keep one problem solved properly:

- **Intent / rerank-by-intention (#5)** — built it, then **cut it**: a heuristic
  "smart" ranker is unverifiable without relevance labels, and shipping ranking I can't
  measure is worse than not. Revisit with a real eval harness.
- **The browser-flow / step-debugging idea (#7, #11)** — built it, then **cut it**: a
  second problem on a different surface dilutes a completeness submission.
- **"Deep research" as an agent (#1's nostalgia)** — Firecrawl's `/agent` already does
  autonomous LLM research; I did *not* rebuild it. The decomposition here is a cheaper,
  deterministic, search-native path to the same coverage goal.
- **Markdown `dedupe` (#3)** is *intra-page*, different from my cross-result dedup, so I
  don't claim it; **fast snippets (#4)** already ship; **BYO proxies (#2), LinkedIn
  (#10), and reliably beating soft-blocks** are the anti-bot arms race — out of scope;
  **#6** is composable from `question`/`agent`; **#9** is too big to do well.
- **A web-form-first product** — wrong for a batch job; the CLI is the product.

## One thing an AI tool got wrong (and how I caught it)

Adding a freshness control, the assistant set **`maxAge` as a top-level `/v2/search`
parameter** (reasonable — it's top-level on `scrape`). Every query then returned **zero
results**. A raw `curl` showed why: `unrecognized_keys: ["maxAge"]` — search rejects it.
`maxAge` is a *scrape* param that lives inside `scrapeOptions`; the result-recency lever
is `tbs`. I split them accordingly. The lesson is the project's whole thesis: **don't
trust the opaque call — verify against the real surface, and make it visible.**
