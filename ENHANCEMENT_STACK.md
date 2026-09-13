# BharatShop Enhancement Stack

This stack adds reviewed open-source capabilities without replacing BharatShop's database, authentication, storefront, or deployment ownership.

## Active local additions

### Vercel AI SDK gateway

- Source review: `vercel/ai`
- Runs as an isolated Node service on `127.0.0.1:8209`.
- Uses the existing BharatShop Gemini or OpenAI-compatible/local model configuration.
- Protected with a generated bearer token stored under `.runtime/enhancements/secrets.env`.
- The core BharatShop AI provider remains intact while this service is evaluated and adopted incrementally.

### Crawlee research runner

- Source review: `apify/crawlee`
- Runs on `127.0.0.1:8207`.
- Intended for product, supplier, trend, and evidence research workflows.
- Limits crawl size/concurrency and rejects localhost/private-network targets before requests are made.
- Protected with a generated bearer token.

### Uptime Kuma

- Source review: `louislam/uptime-kuma`
- Runs in Docker on `127.0.0.1:8210` using the pinned `2.5.4` image.
- Keeps its data in a dedicated Docker volume.
- Requires one-time monitor configuration in its own UI after first startup.

## Registered, intentionally disabled

### Trigger.dev

Registered as the candidate durable job engine for long-running agent tasks, retries, schedules, and approvals. It remains disabled until a project/secret or a reviewed self-hosted runtime is explicitly configured.

### Langfuse

Registered as the candidate LLM/agent observability layer. It remains disabled until a Langfuse instance and server-side keys are explicitly configured.

## Commands

Use Windows PowerShell through the existing npm scripts:

```powershell
npm.cmd run enhancements:bootstrap
npm.cmd run enhancements:status
npm.cmd run enhancements:stop
```

The bootstrap is idempotent, discovers Docker Desktop even when the current PowerShell PATH is stale, starts Docker Desktop when necessary for Uptime Kuma, and writes local runtime flags to `.env.local`.

## Security and production rules

- Never commit `.env.local`, runtime secrets, provider keys, or database URLs.
- Enhancement services bind to loopback by default.
- Crawlee blocks private-network targets to reduce SSRF risk.
- Production remains opt-in for every enhancement.
- No enhancement may reset, migrate, or replace the BharatShop production database.
- Trigger.dev and Langfuse are configuration placeholders only until explicitly enabled and reviewed.
- Netlify does not run this local Docker/workstation stack; production worker hosting is a separate deployment decision.
