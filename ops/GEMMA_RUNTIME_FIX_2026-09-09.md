# Gemma runtime reliability fix — 2026-09-09

- BharatShop production AI_BASE_URL is routed directly to `bharatshop-local-ai`.
- Local Ollama keeps `gemma3:270m-it-qat` loaded for 10 minutes.
- Startup smoke test is enabled on the local AI service.
- Application AI calls honor `AI_MIN_TIMEOUT_MS` so free-tier cold inference is not killed by short caller timeouts.
- Production acceptance no longer creates or requires the removed fashion pipeline.
- Acceptance now requires a real local Gemma inference (`modelReady=true`) and a live CEO model response (`ai-agent-live`, `modelStatus=live`).
- Spending, purchasing, external commitments, credentials, destructive DB work, refunds and payouts remain human-gated.
