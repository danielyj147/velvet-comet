#!/usr/bin/env bash
# Optional AI path via local Ollama — installs Ollama (if missing), starts it, and
# pulls a small embedding + chat model so a clean machine can run the model path with
# zero accounts. Prefer hosted providers? Skip this and set ANTHROPIC_API_KEY or
# OPENAI_API_KEY in .env instead. Override models: EMBED_MODEL=… EXPAND_MODEL=… make models
set -euo pipefail

EMBED="${EMBED_MODEL:-nomic-embed-text}"     # ~274MB
CHAT="${EXPAND_MODEL:-llama3.2:3b}"          # ~2GB

if ! command -v ollama >/dev/null 2>&1; then
  echo "→ Installing Ollama…"
  if [[ "${OSTYPE:-}" == darwin* ]] && command -v brew >/dev/null 2>&1; then
    brew install ollama
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
fi

if ! curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "→ Starting ollama serve (background, logs → /tmp/ollama.log)…"
  (ollama serve >/tmp/ollama.log 2>&1 &)
  for _ in $(seq 1 20); do
    curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "→ Pulling $EMBED and $CHAT (one-time)…"
ollama pull "$EMBED"
ollama pull "$CHAT"

cat <<EOF

✓ Ollama ready. Add these to your .env to enable the local AI path:

  OLLAMA_HOST=http://localhost:11434
  EMBED_MODEL=$EMBED
  EXPAND_MODEL=$CHAT

(Or skip Ollama entirely and set a hosted key in .env:
  ANTHROPIC_API_KEY=sk-ant-...   # Claude — query expansion + entity probes
  OPENAI_API_KEY=sk-...          # OpenAI — expansion + embeddings)

AI stays OFF until configured; the default pipeline is fully lexical.
EOF
