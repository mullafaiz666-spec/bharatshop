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
- The system dock is read-only and only exposes whitelisted local runtime counters/status fields.

## Start

From the BharatShop repository:

```powershell
npm.cmd run machine:web
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
- Collapsible **System** dock with Machine AI state, agent count, memory-entry count, pending/completed task counters and runtime details.
- Quick links from the System dock to BharatShop, BharatDrip, Agents and the BharatShop Command Centre.
- No web deployment is required for local use.

## System endpoint

`GET /api/local-ai/system`

The endpoint reads only local status data:

- `%LOCALAPPDATA%/BharatShop/MachineAI/heartbeat.json`
- pending/result JSON counts under the Machine AI state directory
- memory entry counts under `~/.bharatshop-ai/memory`
- local Agency catalogue metadata (agent/division counts)

It does not execute shell commands, mutate files, expose memory contents, access production databases or reveal secret values.

## Deliberately approval-gated / next integrations

File uploads, image generation, microphone/voice, browser automation, coding actions and production-changing company actions are separate integrations. They should remain explicit and approval-gated rather than being silently enabled by the chat UI.
