#!/bin/sh
set -eu

MODEL="${GEMMA_MODEL:-gemma3:4b}"

# The same repository can serve either as a lightweight gateway or as the
# machine that actually owns Ollama. Keep the gateway separate on tiny cloud
# instances; point OLLAMA_UPSTREAM at a free machine you control that has
# enough RAM for the chosen Gemma model.
if [ "${GATEWAY_ONLY:-0}" = "1" ]; then
  echo "GEMMA_GATEWAY_MODE: remote-upstream"
  echo "GEMMA_GATEWAY_UPSTREAM: ${OLLAMA_UPSTREAM:-missing}"
  echo "GEMMA_GATEWAY_MODEL: $MODEL"
  exec node local-ai/proxy.mjs
fi

export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-15m}"
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-2048}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "OLLAMA_START_ERROR: ollama binary not found"
  exit 1
fi

ollama serve >/tmp/ollama.log 2>&1 &
ollama_pid=$!
trap 'kill "$ollama_pid" 2>/dev/null || true' EXIT INT TERM

api_ready=0
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/tmp/ollama-tags.json 2>/dev/null; then
    api_ready=1
    echo "OLLAMA_API_READY: attempt=$i"
    break
  fi
  echo "OLLAMA_WAIT: API not ready attempt=$i"
  sleep 1
done

if [ "$api_ready" -ne 1 ]; then
  echo "OLLAMA_READY_FAIL: API was not available within 120s"
  tail -n 80 /tmp/ollama.log || true
  exit 1
fi

if ! grep -Fq "\"name\":\"$MODEL\"" /tmp/ollama-tags.json && ! grep -Fq "\"model\":\"$MODEL\"" /tmp/ollama-tags.json; then
  echo "OLLAMA_MODEL_MISSING: pulling $MODEL"
  ollama pull "$MODEL"
fi

if ! ollama list | grep -Fq "$MODEL"; then
  echo "OLLAMA_MODEL_FAIL: $MODEL is not available after pull"
  exit 1
fi

echo "OLLAMA_MODEL_READY: $MODEL"

# Warm the model before accepting gateway traffic. Failure is observable but
# does not destroy Ollama itself; the gateway readiness endpoint will still
# report the actual upstream state.
if timeout 180 ollama run "$MODEL" 'Reply with exactly WARM' >/tmp/gemma-warm.txt 2>/tmp/gemma-warm.err; then
  echo "OLLAMA_MODEL_WARM: $MODEL"
else
  echo "OLLAMA_MODEL_WARM_WARN: $MODEL did not warm within 180s"
  tail -n 20 /tmp/gemma-warm.err || true
fi

exec node local-ai/proxy.mjs
