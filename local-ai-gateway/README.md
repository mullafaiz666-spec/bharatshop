# BharatShop Local AI Gateway

This stack provides a self-hosted, OpenAI-compatible AI endpoint for BharatShop using `llama.cpp` and Gemma 3 4B IT. `llama-server` supports `/v1/chat/completions` and multimodal image input, so the same endpoint can serve text and vision requests.

## Architecture

`BharatShop Render -> HTTPS tunnel/domain -> gateway:8090 -> llama-server:8080 -> Gemma 3 4B IT`

The gateway is intentionally a thin authenticated reverse proxy. PostgreSQL, SearXNG, catalog publication and CEO approval logic remain in BharatShop; this service only supplies model inference.

## Local start

Requirements: Docker Desktop/Linux Docker and enough RAM/VRAM for Gemma 3 4B IT.

```bash
cd local-ai-gateway
cp .env.example .env
# Set a long random GATEWAY_API_KEY before exposing anything publicly.
docker compose up -d
curl http://127.0.0.1:8090/health
curl http://127.0.0.1:8090/v1/models
```

The first start downloads the GGUF model into the Docker volume. `llama.cpp` documents `llama-server` as an OpenAI-compatible HTTP server and supports running GGUF models directly from Hugging Face.

## Vision smoke test

Use the OpenAI-compatible chat endpoint with an `image_url` content part. `llama-server` supports remote image URLs and base64 image input for multimodal models.

```bash
curl http://127.0.0.1:8090/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma-3-4b-it","messages":[{"role":"user","content":[{"type":"text","text":"Describe this product image in one sentence."},{"type":"image_url","image_url":{"url":"https://example.com/product.jpg"}}]}],"max_tokens":128}'
```

## Public HTTPS endpoint

For a temporary smoke test:

```bash
docker compose --profile quick-tunnel up -d
```

Cloudflare Quick Tunnels are suitable for testing but the generated hostname is not the production stability target. For Render production, use a persistent HTTPS tunnel/domain that remains reachable while the local machine is online. Do not commit tunnel credentials or API keys.

## Render variables

```text
AI_PROVIDER=local-openai-compatible
AI_BASE_URL=https://<stable-gateway-domain>/v1
AI_TEXT_MODEL=gemma-3-4b-it
AI_VISION_MODEL=gemma-3-4b-it
AI_API_KEY=<GATEWAY_API_KEY>
```

If `GATEWAY_API_KEY` is intentionally empty, leave `AI_API_KEY` empty too, but only expose the gateway behind a trusted private network/tunnel. Never put secrets in Git.

## Production gate

Before changing Render configuration, verify locally:

1. `/health` returns HTTP 200.
2. `/v1/models` lists `gemma-3-4b-it`.
3. Text chat completes successfully.
4. Vision chat accepts an HTTPS image and returns a meaningful description.
5. The public HTTPS URL can be reached from an external network.
6. Only then set the Render `AI_*` variables and run `/api/health?deep=1`.

This design does not claim lifetime-free uptime: inference software/model access can be free, but the machine and public networking path must remain available.
