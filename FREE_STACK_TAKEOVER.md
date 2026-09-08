# BharatShop Free-Stack Takeover

Target recurring software/API cost: ₹0 wherever technically possible.

## Production architecture

- BharatShop web/API: Render free service while viable.
- PostgreSQL: existing production database remains source of truth; never reset or destructively reseed.
- AI: Gemma via an OpenAI-compatible local gateway.
- Runtime owner: Ollama on a free machine controlled by the operator with enough memory for the selected Gemma model.
- Cloud gateway: lightweight Node proxy only; it must not pretend a tiny free instance can reliably host Gemma 3 4B.
- Image discovery: self-hosted SearXNG.
- Image verification: local Gemma vision; no paid Claude/OpenAI requirement.
- Automation: GitHub Actions with conservative schedules and batch sizes.

## Reliability rules

1. No fake provider readiness.
2. No placeholder image publication.
3. SearXNG 429 creates a global cooldown; the catalog remains staged and retries later.
4. AI cold starts are allowed a bounded, configurable timeout.
5. One local Ollama model/request at a time on modest hosts.
6. External actions still require real evidence and approvals.
7. Production PostgreSQL is never wiped by automation.

## Required environment

Main BharatShop service:
- `DATABASE_URL`
- `AI_BASE_URL` (Gemma gateway URL)
- `AI_PROVIDER=local-openai-compatible`
- `AI_TEXT_MODEL=gemma3:4b` (or chosen local Gemma model)
- `AI_VISION_MODEL=gemma3:4b`
- `AI_REQUEST_TIMEOUT_MS=180000`
- `AI_READINESS_TIMEOUT_MS=60000`
- `SEARXNG_URL`
- `SEARXNG_IMAGE_ENGINES=bing images` (or explicitly selected engines)
- `SEARXNG_MIN_SEARCH_GAP_MS=2500`
- `BHARATSHOP_AUTOMATION_TOKEN`

Gateway service:
- `GATEWAY_ONLY=1`
- `OLLAMA_UPSTREAM=http(s)://<free-local-host>:11434`
- `GEMMA_MODEL=gemma3:4b`

Ollama host:
- `GEMMA_MODEL=gemma3:4b`
- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_LOADED_MODELS=1`
- `OLLAMA_CONTEXT_LENGTH=2048`

The gateway and app can remain cloud-hosted for free; the actual 4B inference must run on hardware with sufficient RAM. This document intentionally does not claim free Render compute can run Gemma 3 4B reliably.
