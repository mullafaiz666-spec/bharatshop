FROM node:20-bookworm-slim

WORKDIR /app

# The local-AI Render service needs a non-interactive, user-space Ollama runtime.
# Install it while the image is being built (build runs as root), so the runtime
# start script never needs sudo/root privileges.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://ollama.com/install.sh | sh

COPY package.json ./
RUN npm install --ignore-scripts

COPY . .

# Pre-fetch Gemma into the image. This avoids downloading the model on every
# Render restart/cold start. The model is Gemma 3 4B, which supports text + vision.
RUN ollama serve >/tmp/ollama-build.log 2>&1 & \
    pid=$!; \
    for i in $(seq 1 60); do curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 2; done; \
    ollama pull gemma3:4b; \
    kill "$pid" 2>/dev/null || true

ENV NODE_ENV=production
EXPOSE 10000

CMD ["sh", "local-ai/start.sh"]
