Status after first patch set:
- Gemma provider code now targets Ollama-compatible /v1 endpoints.
- Paid OpenAI helper calls now delegate to local Gemma while preserving existing function names.
- General SearXNG web searches are serialized, paced and retry 429 using Retry-After/backoff.
- Product discovery no longer performs immediate image resolution in the same loop.
- Production database has not been reset, reseeded or otherwise destructively changed by this patch.

Production verification is intentionally pending until this branch passes CI and is deployed.
