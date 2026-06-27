# Firecrawl take-home — dev shortcuts.
# Two products live here: `tracewright` (step-level browser-flow observability)
# and `searchtrace` (observable retrieval pipeline over Firecrawl search).
# Run `make` or `make help` to see everything.

.DEFAULT_GOAL := help
.PHONY: help install env typecheck test \
        demo checkpoint trace-api trace-web \
        search search-help embeddings \
        clean

# searchtrace query + extra flags: `make search Q="competitor pricing" ARGS="--tier thorough"`
Q ?= reciprocal rank fusion
ARGS ?=

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## --- setup ---------------------------------------------------------------

install: ## Install dependencies
	npm install

env: ## Create .env from the template if missing (then add your key)
	@test -f .env || (cp .env.example .env && echo "Created .env — add your FIRECRAWL_API_KEY")

typecheck: ## Type-check the whole repo
	npx tsc --noEmit

test: ## Run the test suite
	npm test

## --- tracewright (browser-flow observability) ----------------------------

demo: ## tracewright CLI: run a flow and print the step trace (FLOW=flows/...json)
	npm run demo $(FLOW)

checkpoint: ## tracewright: validate the Firecrawl CDP connection (1 short session)
	npm run checkpoint

trace-api: ## tracewright: build the viewer + serve UI/API on :8787
	npm run build:web && npm run server

trace-web: ## tracewright: Vite dev server for the viewer (proxies to :8787)
	npm run web

## --- searchtrace (retrieval pipeline) ------------------------------------

search: ## searchtrace CLI on a query: make search Q="..." ARGS="--tier thorough --diversity 0.5"
	npm run search:demo -- "$(Q)" $(ARGS)

search-help: ## Show searchtrace CLI flags
	@echo 'make search Q="query" ARGS="--tier fast|balanced|thorough --diversity 0..1 \'
	@echo '  --minRelevance 0..1 --domains a.com,b.com --categories research,github --topK N --limit N"'

embeddings: ## Pull the local embedding model for semantic relevance/dedup/diversity
	ollama pull nomic-embed-text

## --- housekeeping --------------------------------------------------------

clean: ## Remove build artifacts, local DBs, and captured traces
	rm -rf web-dist dist data/traces data/*.sqlite* data/test-store.sqlite* 2>/dev/null || true
