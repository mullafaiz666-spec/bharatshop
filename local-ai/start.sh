#!/bin/sh
set -eu

# Render Free is too small for Gemma 3 4B inference. Keep Ollama to one loaded
# model/request and a bounded context so the runtime does not waste memory on
# parallel generations.
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-5m}"
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-2048}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "OLLAMA_START_ERROR: ollama binary not found"
  exit 1
fi

ollama serve >/tmp/ollama.log 2>&1 &
ollama_pid=$!
trap 'kill "$ollama_pid" 2>/dev/null || true' EXIT INT TERM

# Do not start the gateway smoke test until Ollama itself is reachable and the
# required Gemma model is visible. This removes the startup race seen in the
# previous implementation.
ready=0
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/tmp/ollama-tags.json 2>/dev/null; then
    if grep -q 'gemma3:4b' /tmp/ollama-tags.json; then
      ready=1
      echo "OLLAMA_READY: model=gemma3:4b attempt=$i"
      break
    fi
    echo "OLLAMA_WAIT: API ready but gemma3:4b not listed attempt=$i"
  else
    echo "OLLAMA_WAIT: API not ready attempt=$i"
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "OLLAMA_READY_FAIL: gemma3:4b was not available within 120s"
  echo "OLLAMA_LOG_TAIL_BEGIN"
  tail -n 80 /tmp/ollama.log || true
  echo "OLLAMA_LOG_TAIL_END"
  exit 1
fi

exec node local-ai/proxy.mjs
