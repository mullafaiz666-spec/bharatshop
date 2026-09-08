#!/bin/sh
set -eu

if [ "${GATEWAY_ONLY:-0}" = "1" ]; then
  echo "GEMMA_GATEWAY_MODE: remote-upstream"
  echo "GEMMA_GATEWAY_UPSTREAM: ${OLLAMA_UPSTREAM:-missing}"
  exec node local-ai/proxy.mjs
fi

MODEL="${GEMMA_MODEL:-gemma3:270m-it-qat}"
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30s}"
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-1024}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "OLLAMA_START_ERROR: ollama binary not found"
  exit 1
fi

ollama serve >/tmp/ollama.log 2>&1 &
ollama_pid=$!
trap 'kill "$ollama_pid" 2>/dev/null || true' EXIT INT TERM

ready=0
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/tmp/ollama-tags.json 2>/dev/null; then
    if grep -Fq "$MODEL" /tmp/ollama-tags.json; then
      ready=1
      echo "OLLAMA_READY: model=$MODEL attempt=$i"
      break
    fi
    echo "OLLAMA_WAIT: API ready but $MODEL not listed attempt=$i"
  else
    echo "OLLAMA_WAIT: API not ready attempt=$i"
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "OLLAMA_READY_FAIL: $MODEL was not available within 120s"
  tail -n 80 /tmp/ollama.log || true
  exit 1
fi

exec node local-ai/proxy.mjs
