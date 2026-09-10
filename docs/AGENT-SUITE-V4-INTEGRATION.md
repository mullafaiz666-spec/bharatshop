# BharatShop Agent Suite v4 integration

This revision integrates the useful production patterns from the supplied agent workspaces into the existing BharatShop application. It does not deploy their standalone SQLite demo services or create a competing source of truth.

## Integrated capabilities

- Source evidence freshness policies for price, availability, shipping, supplier identity and stable product fields.
- Safe commerce and media URL retrieval with private-network/unsafe redirect rejection.
- First-class Image & Media Agent in the same operational contract/runtime/company-work-bus model as every other BharatShop agent.
- Byte-level JPEG/PNG/WebP validation, dimension checks, bounded downloads, canonical URL deduplication and SHA-256 duplicate detection.
- Explicit distinction between technical/source media evidence and semantic AI vision. BharatShop does not fabricate a vision verdict when a multimodal model is unavailable.
- Deep agent readiness endpoint at `/api/agents/health?deep=1`, covering production PostgreSQL/shared-agent tables, live local Gemma model probe, SearXNG JSON query, automation authorization and runtime tool mappings.

## Source of truth and safety

Production PostgreSQL remains the only operational source of truth. The integration is additive and does not reset, replace, drop or destructively reseed existing business data.

Missing, expired or conflicting evidence means HOLD/BLOCK rather than guessing. Standard sourced product publication now requires current source evidence; expired evidence must be reverified. Paid spend, supplier purchase/payment submission, refunds/payouts, credential changes and destructive database actions remain human-gated.

## Readiness meaning

An agent is `READY` only when every dependency required by that agent passes and the agent has a non-empty runtime tool mapping. Deep verification tests actual dependencies instead of only checking environment variable presence. `summary.allReady=true` is therefore the release acceptance condition for the complete agent suite.
