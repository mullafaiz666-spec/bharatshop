# BharatShop Creative Engine

BharatShop Creative Engine is BharatShop's own UI-free creative-generation layer. It gives the website, AI agents, automations and terminal scripts one stable API instead of coupling the project to a single media vendor.

## Goals

- Free-first generation using the project's existing Hugging Face/FLUX-style ZeroGPU adapters.
- Optional Gemini image fallback when `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` is configured.
- Reuse the existing BharatShop Fashion Studio policy gate instead of bypassing product provenance or profitability rules.
- Structured JSON suitable for agents and automation.
- Keep provider-specific details behind one BharatShop-owned interface so video, voice, music and workflow/canvas support can be added later without rewriting callers.

## API

### Discover capabilities

```bash
curl https://YOUR-BHARATSHOP/api/creative
```

`GET /api/creative` is read-only and returns supported modes, providers and planned capabilities.

### Generate an original image

```bash
curl -X POST https://YOUR-BHARATSHOP/api/creative \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTOMATION_TOKEN' \
  -d '{
    "action":"image",
    "prompt":"Original BharatShop monsoon streetwear campaign, editorial ecommerce photography",
    "aspectRatio":"4:5",
    "provider":"auto"
  }'
```

Provider behavior:

1. `auto` tries the free Hugging Face/ZeroGPU path first and only uses configured Gemini image generation as a fallback.
2. `free` uses only the free generator path.
3. `google` uses the configured Gemini image endpoint directly.

The API returns a data URL plus provider metadata. No image-generation SDK dependency is added to the application.

### Refresh original Fashion Studio views

```bash
curl -X POST https://YOUR-BHARATSHOP/api/creative \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTOMATION_TOKEN' \
  -d '{"action":"fashion","command":"/autoimage","productId":123,"count":4}'
```

This delegates to the existing Fashion Studio command layer. It therefore keeps the existing rule that generated views are for original BharatShop Studio/Qikink designs and do not replace supplier-backed product imagery with invented lookalikes.

## CLI

The repository exposes the same functions from the terminal:

```bash
npm run creative -- capabilities --json
npm run creative -- image --prompt "Original BharatShop campaign visual" --aspect-ratio 4:5 --output campaign.png
npm run creative -- fashion --product-id 123 --command /autoimage --count 4 --json
```

Connection variables:

```bash
BHARATSHOP_URL=https://your-deployment.example
BHARATSHOP_AUTOMATION_TOKEN=your-existing-automation-token
```

`PUBLIC_BASE_URL` and `AUTOMATION_TOKEN` are accepted as compatible fallbacks.

## Security

Generation requests are accepted only when either:

- the request has a valid BharatShop admin session, or
- the request presents `BHARATSHOP_AUTOMATION_TOKEN` / `AUTOMATION_TOKEN`.

Capability discovery does not execute a model and remains public.

## Current support

| Mode | Status | Backend |
| --- | --- | --- |
| Image | Working | Free Hugging Face/ZeroGPU first; optional Gemini fallback |
| Fashion Studio views | Working | Existing BharatShop Studio/Qikink local view engine |
| Video | Planned adapter | Not advertised as working yet |
| Voice | Planned adapter | Not advertised as working yet |
| Music | Planned adapter | Not advertised as working yet |
| Canvas/workflows | Planned | Will orchestrate creative nodes after the base adapters exist |

## Architecture

```text
BharatShop UI / AI Agents / n8n / terminal
                 |
                 v
          /api/creative
                 |
       +---------+----------+
       |                    |
       v                    v
 image generation       fashion command
       |                    |
       v                    v
 free ZeroGPU --> Gemini   existing Fashion Studio
 (default)      (optional) policy + persistence
```

The creative engine does not change the production database schema and does not reset, seed, replace or migrate any production data.
