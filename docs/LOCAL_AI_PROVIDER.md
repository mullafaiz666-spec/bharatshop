# BharatShop free/local AI provider

BharatShop now uses one OpenAI-compatible provider abstraction for CEO text and product-image vision. Paid OpenAI and Anthropic endpoints are no longer part of the application request path.

## Production environment

Set these on the Render BharatShop service:

- `AI_PROVIDER=local-openai-compatible`
- `AI_BASE_URL=https://<your-local-ai-gateway>/v1`
- `AI_TEXT_MODEL=gemma-3-4b-it`
- `AI_VISION_MODEL=gemma-3-4b-it`
- `AI_API_KEY=` only when the gateway requires authentication
- `IMAGE_VERIFY_MIN_CONFIDENCE=0.75`

The gateway must expose an OpenAI-compatible `/models` endpoint and `/chat/completions`. Vision requests use `image_url` data URLs.

## Gateway choices

Use Ollama or llama.cpp on hardware that can actually run the selected model. The Render BharatShop web service remains the application/database service; it does not download a large model into its web container.

A free model does not imply free compute. Keep the model gateway on available local/owned hardware or another compute service whose cost is acceptable. Do not lower the publication gate to compensate for a weak model or insufficient compute.

## Acceptance requirements

CEO acceptance remains:

`CEO -> local text model -> Agent -> Tool -> Evidence -> Audit -> Decision -> Human Approval -> Action -> Verified Result`

Catalog acceptance remains:

`SearXNG -> local vision model -> >=4 verified HTTPS images -> PostgreSQL -> PUBLISHED`

A product is not published when fewer than four images pass the configured confidence threshold. Placeholder, unrelated, or non-HTTPS images remain blocked.

## Health

`/api/health` now reports PostgreSQL plus the configured AI provider. `/api/health?deep=1` exercises the text model. A missing `AI_BASE_URL` intentionally keeps health at 503 so production cannot silently operate without the free provider.

## Database safety

This change does not reset, seed, truncate, or replace PostgreSQL data. Existing verified images are reused only when their verification provider/model match the configured local provider and vision model.
