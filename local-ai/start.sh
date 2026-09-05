#!/bin/sh
set -eu

# Ollama is installed in the Docker image at build time. Render's runtime
# user does not need (and must not need) root/sudo access.
ollama serve >/tmp/ollama.log 2>&1 &
ollama_pid=$!

cleanup() {
  kill "$ollama_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Fail fast if Ollama did not actually start; the proxy must never advertise a
# healthy gateway when its model backend is unavailable.
curl -fsS http://127.0.0.1:11434/api/tags >/dev/null

node local-ai/proxy.mjs
