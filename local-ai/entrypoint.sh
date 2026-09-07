#!/bin/sh
set -eu

# Gemma 3 4B is memory-sensitive on modest CPU instances. Keep exactly one
# model loaded and one inference at a time, with a bounded context. These
# settings must be applied here as well as local-ai/start.sh because the
# Docker deployment starts through this entrypoint.
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-5m}"
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-2048}"

ollama serve &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT INT TERM

for i in $(seq 1 120); do
  if ollama list >/dev/null 2>&1; then
    echo "OLLAMA_READY: api attempt=$i"
    break
  fi
  echo "OLLAMA_WAIT: api attempt=$i"
  sleep 2
done

if ! ollama list >/dev/null 2>&1; then
  echo "OLLAMA_READY_FAIL: Ollama API did not become ready"
  exit 1
fi

# Gemma 3 4B supports text and image inputs through Ollama's OpenAI-compatible API.
ollama pull gemma3:4b

if ! ollama list | grep -q 'gemma3:4b'; then
  echo "OLLAMA_MODEL_FAIL: gemma3:4b is not available after pull"
  exit 1
fi

echo "OLLAMA_MODEL_READY: gemma3:4b"
wait "$pid"
