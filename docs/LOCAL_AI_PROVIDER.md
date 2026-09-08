# Local Gemma runtime

Use existing suitable hardware for Ollama. The web application stays on Render and uses its existing PostgreSQL database. Do not try to run the full multimodal model inside the constrained web process. No paid provider fallback is implemented.

Application configuration:

```dotenv
AI_PROVIDER=local-openai-compatible
AI_BASE_URL=https://YOUR-OWN-GATEWAY
AI_API_KEY=YOUR-GATEWAY-KEY
AI_TEXT_MODEL=gemma3:4b
AI_VISION_MODEL=gemma3:4b
AI_TOOL_MODE=json
IMAGE_VERIFIER_MODE=local-ai
IMAGE_VERIFY_MIN_CONFIDENCE=0.75
SEARXNG_URL=https://YOUR-SEARXNG
```

AI_BASE_URL accepts either the origin or an origin ending in `/v1`. Model names must match `/v1/models` exactly. Gemma uses validated JSON tool planning; a model with native tool calling can use `AI_TOOL_MODE=native`. Every tool is still checked against its agent's allowlist before dispatch.

Gateway configuration:

```dotenv
OLLAMA_UPSTREAM=http://127.0.0.1:11434
AI_GATEWAY_API_KEY=YOUR-GATEWAY-KEY-AT-LEAST-32-CHARACTERS
PORT=10000
```

Run `node local-ai/proxy.mjs` after starting Ollama and pulling the configured model. Place the gateway behind HTTPS; expose only the authenticated gateway, not Ollama. It forwards native `/v1` payloads without stripping images, models, tool results or token limits. Text-only model availability does not prove vision availability.

Set Render's application health-check path to `/api/live`. This is explicitly process liveness. `/api/health` reports degraded until inference is exercised. Authenticated `/api/health?deep=1` exercises database, text, a controlled image-pixel probe and SearXNG image search. The probe fixture is never catalogue media. A passing probe still does not prove product image matching or orchestration; use real acceptance evidence for those gates.

Media is persisted as `AI_VISION_VERIFIED` only following validated local vision output. At least four distinct HTTPS images with confidence >= 0.75 are required. Old keyword-only records remain in PostgreSQL as history but cannot satisfy storefront publication. Resolution stores media; it does not itself grant publication approval. Listing checks the persisted approval state and media gate.

Optional image generation needs `LOCAL_IMAGE_BASE_URL`, `LOCAL_IMAGE_MODEL`, and optionally `LOCAL_IMAGE_API_KEY`. The local service must implement `/v1/images/generations` with the documented request shape in `src/lib/ai/local-image-generator.ts`; reference editing requires its `reference_image` extension. Gemma does not generate image pixels. Generated media remains distinct from verified source media.

Database schema push and startup synchronization are deliberately blocked. Use explicit, reviewed additive migrations. No production schema or records were modified during this patch.
