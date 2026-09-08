# BharatShop free/local AI provider

BharatShop uses an OpenAI-compatible local provider for CEO/agent text inference. Paid OpenAI and Anthropic endpoints are not required in the application request path.

## Production environment

Set these on the Render BharatShop service:

- `AI_PROVIDER=local-openai-compatible`
- `AI_BASE_URL=https://<your-local-ai-gateway>` **or** `https://<your-local-ai-gateway>/v1` (both are supported)
- `AI_TEXT_MODEL=gemma3:270m-it-qat` on the current 512 MB Render free-tier runtime
- `AI_VISION_MODEL=local-evidence-v1`
- `IMAGE_VERIFIER_MODE=local-evidence`
- `AI_API_KEY=` only when the gateway requires authentication
- `IMAGE_VERIFY_MIN_CONFIDENCE=0.75`

The gateway must expose OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints. The BharatShop provider normalizes base URLs so a configured `/v1` suffix is never duplicated.

## Free-tier runtime truth

The current Render free service cannot reliably load the multi-billion-parameter multimodal Gemma model required for true Gemma vision. The production free stack therefore uses:

- Gemma `gemma3:270m-it-qat` for text inference.
- `local-evidence-v1` for strict image evidence verification (HTTPS reachability, content type, source/title and brand/title token checks).

Do not report multimodal Gemma as active on this tier. If a larger local/owned machine is connected later, the image verifier can be upgraded without weakening the publication gate.

## Gateway choices

Use the included Ollama gateway on hardware that can actually run the configured model. A free model does not imply free compute; the current production choice intentionally fits within the available free Render memory budget.

The gateway relays OpenAI-compatible function/tool definitions to Ollama and normalizes Ollama tool calls back to OpenAI-compatible `tool_calls`. Runtime acceptance still has to prove that the selected model actually performs the requested tool-selection behavior; code support alone is not a green gate.

## Acceptance requirements

CEO acceptance remains:

`CEO -> local text model -> Agent -> Tool -> Evidence -> Audit -> Decision -> Human Approval -> Action -> Verified Result`

Catalog acceptance on the current free tier is:

`SearXNG -> local evidence verifier -> >=4 verified HTTPS images -> PostgreSQL -> PUBLISHED`

A product is not published when fewer than four images pass the configured confidence threshold. Placeholder, unrelated, non-HTTPS or unverifiable images remain blocked.

## Search pacing

The free SearXNG deployment uses sequential engine fallback and request spacing. General search defaults to `brave`, then `bing`, then `duckduckgo`. Image search defaults to `brave.images`, then `bing images`, then `startpage images`. Catalog maintenance runs in small batches so shared-hosting upstream rate limits are not converted into fake success.

## Health

`/api/health` reports PostgreSQL plus the configured AI provider, image verifier and SearXNG. `/api/health?deep=1` exercises the text model and a real SearXNG image search. A missing or unreachable required provider intentionally keeps health at 503.

## Database safety

Never reset, truncate, destructively reseed or replace production PostgreSQL. This provider/search patch does not modify the production schema or delete data. Schema changes must remain additive and production-safe.
