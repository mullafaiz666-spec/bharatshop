#!/bin/sh
set -eu

# Render Free is a Node/CPU service. Do not attempt apt/sudo/root installs here.
# The gateway can proxy to a local Ollama instance when one is supplied, or to
# an OpenAI-compatible hosted Gemma provider (OpenRouter) via environment vars.
if command -v ollama >/dev/null 2>&1; then
  ollama serve >/tmp/ollama.log 2>&1 &
  ollama_pid=$!
  trap 'kill "$ollama_pid" 2>/dev/null || true' EXIT INT TERM
fi

exec node local-ai/proxy.mjs
