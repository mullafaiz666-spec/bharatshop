# BharatShop Free-Stack Takeover

Architecture lock:
- AI CEO / agents / vision: Gemma 3 4B through Ollama/local OpenAI-compatible gateway.
- Image discovery: self-hosted SearXNG only.
- Database: production PostgreSQL remains source of truth; no destructive reset/reseed.
- Hosting/automation: Render + GitHub Actions within free-tier constraints where possible.
- Paid OpenAI/Anthropic APIs are not required for production acceptance.

Current verified blockers from 2026-09-08 production evidence:
1. Gemma gateway readiness returned timeouts / 502 while PostgreSQL remained ready.
2. SearXNG returned repeated HTTP 429 responses during catalog maintenance; 0/10 products resolved.

Fix sequence:
1. Use Ollama's OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints end-to-end.
2. Keep existing tool calls and vision inputs on the Gemma path.
3. Pace SearXNG requests, serialize web searches and honor Retry-After on 429s.
4. Decouple product discovery from image resolution so one maintenance cycle does not hammer SearXNG.
5. Re-run source CI, then production health/catalog acceptance after deployment.

No production database mutations are part of this patch.
