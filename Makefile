# Spectra — dev shortcuts. Run `make` to see everything.
# One product: searchtrace — an observable, tunable retrieval layer over Firecrawl
# search, surfaced as a Next.js app (`app/`) + a CLI.

.DEFAULT_GOAL := help
.PHONY: help install env typecheck test dev build start search search-help embeddings clean

# searchtrace CLI query + flags: `make search Q="competitor landscape" ARGS="--tier thorough"`
Q ?= reciprocal rank fusion
ARGS ?=

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

## --- setup ---
install: ## Install dependencies
	npm install
env: ## Create .env from the template if missing (then add your key)
	@test -f .env || (cp .env.example .env && echo "Created .env — add your FIRECRAWL_API_KEY")
typecheck: ## Type-check the repo
	npx tsc --noEmit
test: ## Run the test suite
	npm test

## --- the app (UI + API on :8788) ---
dev: ## Next dev server (hot reload)
	npm run dev
build: ## Production build
	npm run build
start: ## Serve the production build
	npm run start

## --- searchtrace CLI ---
search: ## CLI: make search Q="..." ARGS="--tier thorough --diversity 0.5 --domains a.com,b.com"
	npm run search:demo -- "$(Q)" $(ARGS)
search-help: ## Show searchtrace CLI flags
	@echo 'ARGS="--tier fast|balanced|thorough --diversity 0..1 --minRelevance 0..1 \'
	@echo '  --recency any|day|week|month|year --domains a.com,b.com --categories research,github"'
embeddings: ## Pull the local embedding model (optional — semantic ranking/dedup)
	ollama pull nomic-embed-text

## --- housekeeping ---
clean: ## Remove build artifacts and local data
	rm -rf .next dist data/traces 2>/dev/null || true
