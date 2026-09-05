#!/bin/sh
set -eu

if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

ollama serve >/tmp/ollama.log 2>&1 &
ollama_pid=$!

for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
  sleep 2
done

ollama pull gemma3:4b

node local-ai/proxy.mjs

kill "$ollama_pid" 2>/dev/null || true
