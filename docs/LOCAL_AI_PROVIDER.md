# BharatShop AI provider architecture

BharatShop supports two AI execution paths through the same provider abstraction:

1. **Hosted production:** Gemini on the Netlify/Supabase free-stack architecture.
2. **Optional local development/fallback:** the existing OpenAI-compatible Gemma/Ollama gateway, which can now be started from the optional Pinokio local workstation on a desktop with Ollama installed.

Paid OpenAI and Anthropic endpoints are not required in the BharatShop application request path.

## Hosted production

For the approved Netlify production environment, configure:

- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY=<server-side secret>`
- `GEMINI_MODEL=gemini-3.7-flash` (or the explicitly approved replacement)

Never expose `GEMINI_API_KEY` through a `NEXT_PUBLIC_` variable.

The production application, checkout, orders, payment webhooks, digital entitlements, and database must not depend on a laptop or Pinokio process being online.

## Optional local Gemma path

The local provider remains useful for development, low-cost experiments, and owned-hardware fallback. Configure:

- `AI_PROVIDER=local-openai-compatible`
- `AI_BASE_URL=http://127.0.0.1:<gateway-port>` or another explicitly trusted OpenAI-compatible gateway
- `AI_TEXT_MODEL=gemma3:270m-it-qat`
- `AI_VISION_MODEL=local-evidence-v1`
- `IMAGE_VERIFIER_MODE=local-evidence`
- `AI_API_KEY=` only when the gateway requires authentication
- `IMAGE_VERIFY_MIN_CONFIDENCE=0.75`

The included gateway exposes OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints and normalizes Ollama tool calls back to OpenAI-compatible `tool_calls`.

## Pinokio

Pinokio is an optional local launcher only. `start-local-ai.js` reuses the existing `local-ai/start.sh` implementation and fails closed if Ollama is unavailable. It does not silently pull models, change production environment variables, run database migrations, or bypass human approval gates.

A free model does not imply free compute. Local Gemma should run only on hardware that can reliably host the selected model.

## Image verification

`local-evidence-v1` is strict evidence verification rather than true multimodal model vision. It checks source and media evidence and must not be represented as semantic image understanding.

The default production migration can use Gemini for text/tool inference while preserving the existing evidence gates for catalog media until a separately tested vision provider is approved.

## Acceptance requirements

CEO acceptance remains:

`CEO -> AI provider -> Agent -> Tool -> Evidence -> Audit -> Decision -> Human Approval -> Action -> Verified Result`

Catalog acceptance remains:

`search/evidence source -> verifier -> verified HTTPS images -> PostgreSQL -> PUBLISHED`

A product is not published when required evidence is missing. Placeholder, unrelated, non-HTTPS, unauthorized, or unverifiable media remains blocked.

## Production host independence

BharatShop public URLs and production acceptance are host-agnostic. The approved production origin should be supplied through `BHARATSHOP_PUBLIC_ORIGIN` at runtime and `BHARATSHOP_PRODUCTION_URL` as the GitHub Actions repository variable. Netlify also supplies `URL`/`DEPLOY_PRIME_URL` to its runtime.

The legacy Render URL remains only as a temporary fallback during cutover. It should be removed after the Netlify deployment is live, accepted, and the database migration has been explicitly approved.

## Database safety

Never reset, truncate, destructively reseed, drop, or replace production PostgreSQL. Keep the existing production database as source of truth until the Supabase copy is validated and an explicit cutover is approved. Schema changes remain additive and production-safe.
