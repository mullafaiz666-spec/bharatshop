# BharatShop Laptop AI Web Chat

## Purpose

This feature adds a ChatGPT-style browser screen for the existing BharatShop laptop AI without replacing Ollama or the machine AI runtime.

Architecture:

`Browser on 127.0.0.1 -> Next.js local-only APIs -> Ollama 127.0.0.1:11434 -> qwen3.5:4b`

Agency mode additionally reads the existing local Agency Agents catalogue and asks up to three selected specialists before a manager synthesis.

## Local-only safety

- The launcher binds Next.js to `127.0.0.1` only.
- `/api/local-ai/*` rejects non-loopback Host headers.
- Production mode denies the local AI APIs unless `LOCAL_AI_WEB_ENABLED=1` is explicitly set.
- No production database mutation is used by this UI.
- No secret values are required by this UI.
- External connectors are not silently invoked.

## Start

From the BharatShop repository:

```powershell
node scripts\start-local-ai-web.mjs
```

The launcher opens:

`http://127.0.0.1:3001/local-ai`

Press `Ctrl+C` in the launcher terminal to stop the local web server.

## Current interface

- ChatGPT-style two-column desktop layout with responsive mobile sidebar.
- Local browser conversation history using `localStorage`.
- Streaming direct chat from the active Ollama model.
- Explicit `Agency` mode using up to three local specialist agents plus manager synthesis.
- Live runtime status showing model, Ollama readiness and agent count.
- No web deployment is required for local use.

## Deliberately not included yet

File uploads, image generation, microphone/voice, browser automation buttons and production-changing company actions are separate follow-up integrations. They should remain explicit and approval-gated rather than being silently enabled in the first chat UI.
