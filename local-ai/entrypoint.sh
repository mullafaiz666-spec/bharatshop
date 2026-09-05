#!/bin/sh
set -eu

ollama serve &
pid=$!

for i in $(seq 1 60); do
  if ollama list >/dev/null 2>&1; then break; fi
  sleep 2
done

# Gemma 3 4B supports text and image inputs through Ollama's OpenAI-compatible API.
ollama pull gemma3:4b

wait "$pid"
