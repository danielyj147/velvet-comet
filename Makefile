# Spectra — complete, observable web search (Firecrawl).
# CLI is the primary surface (built for nightly batch jobs); the studio is a web UI
# that browses the sessions the CLI writes (and runs ad-hoc searches). They share the
# ./sessions folder, so the studio shows whatever the batch produced.

.DEFAULT_GOAL := help
.PHONY: help install env typecheck test cli batch studio dev embeddings clean

Q ?= competitive intelligence platforms
ARGS ?=
FILE ?= queries.txt

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## --- setup ---
install: ## Install dependencies
	npm install
env: ## Create .env from the template if missing (then add your key)
	@test -f .env || (cp .env.example .env && echo "Created .env — add your FIRECRAWL_API_KEY")
typecheck: ## Type-check the repo
	npx tsc --noEmit
test: ## Run the test suite
	npm test

## --- CLI (primary surface) ---
cli: ## One query: make cli Q="..." ARGS="--target 30 --tier thorough --domains a.com,b.com"
	npm run cli -- "$(Q)" $(ARGS)
batch: ## Nightly job: make batch FILE=queries.txt ARGS="--target 30"
	npm run cli -- --batch $(FILE) $(ARGS)

## --- studio (browse sessions + ad-hoc search) ---
studio: ## Build + serve the studio on :8788 (browses ./sessions)
	npm run build && npm run studio
dev: ## Studio in dev mode (hot reload)
	npm run dev

## --- optional / housekeeping ---
embeddings: ## Pull the local embedding model (optional — semantic ranking)
	ollama pull nomic-embed-text
clean: ## Remove build artifacts (keeps ./sessions)
	rm -rf .next dist 2>/dev/null || true
