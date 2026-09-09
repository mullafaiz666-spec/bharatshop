FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates zstd \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://ollama.com/install.sh | sh

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .

# Render free currently provides only 512 MB RAM. The 4B Gemma image is ~3.3 GB
# and cannot be served reliably there. Pre-fetch the 241 MB QAT 270M model for
# CEO/agent text inference. Image verification is handled separately by the
# local evidence verifier; no fake multimodal claim is made.
ENV GEMMA_MODEL=gemma3:270m-it-qat
RUN ollama serve >/tmp/ollama-build.log 2>&1 & \
    pid=$!; \
    for i in $(seq 1 60); do curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 2; done; \
    ollama pull ${GEMMA_MODEL}; \
    kill "$pid" 2>/dev/null || true

ENV NODE_ENV=production
EXPOSE 10000
CMD ["sh", "local-ai/start.sh"]
