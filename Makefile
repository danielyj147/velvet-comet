# Firecrawl take-home — dev shortcuts. Run `make` to see everything.
#
# Two sibling products share one Next.js app surface:
#   searchtrace/  — observable retrieval pipeline over Firecrawl search  (UI: /search)
#   tracewright/  — step-level observability for browser flows           (UI: /flows)
# `app/` is the shared Next.js UI + API over both; each product also has a CLI.

.DEFAULT_GOAL := help
.PHONY: help install env typecheck test dev build start \
        search search-help flow-demo checkpoint embeddings clean

# searchtrace CLI query + flags: `make search Q="competitor pricing" ARGS="--tier thorough"`
Q ?= reciprocal rank fusion
ARGS ?=

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

## --- setup ---
install: ## Install dependencies
	npm install
env: ## Create .env from the template if missing (then add your key)
	@test -f .env || (cp .env.example .env && echo "Created .env — add your FIRECRAWL_API_KEY")
typecheck: ## Type-check the whole repo
	npx tsc --noEmit
test: ## Run the test suite
	npm test

## --- the app (both surfaces: /search and /flows, with Cmd+K) ---
dev: ## Next dev server on :8788 (hot reload)
	npm run dev
build: ## Production build
	npm run build
start: ## Serve the production build on :8788
	npm run start

## --- searchtrace (retrieval) ---
search: ## CLI: make search Q="..." ARGS="--tier thorough --diversity 0.5 --domains a.com,b.com"
	npm run search:demo -- "$(Q)" $(ARGS)
search-help: ## Show searchtrace CLI flags
	@echo 'ARGS="--tier fast|balanced|thorough --diversity 0..1 --minRelevance 0..1 \'
	@echo '  --domains a.com,b.com --categories research,github --topK N --limit N"'
embeddings: ## Pull the local embedding model (semantic relevance/dedup/diversity)
	ollama pull nomic-embed-text

## --- tracewright (browser flows) ---
flow-demo: ## CLI: run a flow and print the step trace (FLOW=flows/...json)
	npm run flow:demo $(FLOW)
checkpoint: ## Validate the Firecrawl CDP connection (1 short browser session)
	npm run checkpoint

## --- housekeeping ---
clean: ## Remove build artifacts, local DBs, and captured traces
	rm -rf .next dist data/traces public/artifacts data/*.sqlite* 2>/dev/null || true
