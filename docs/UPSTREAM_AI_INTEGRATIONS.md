# BharatShop upstream AI integrations

This project intentionally **does not merge full third-party repositories into the storefront tree**. The requested upstreams are pinned and integrated through service or Agent Skills boundaries so BharatShop keeps one source of truth for auth, data, deployment and commerce logic.

## Pinned upstreams

| Upstream | BharatShop role | Integration | Production default |
| --- | --- | --- | --- |
| Remotion | Product videos, ads, reels and motion templates | External render service | Disabled |
| OpenHands | Developer/engineering agent control plane | External sandboxed service | Disabled |
| PersonaLive | Optional AI presenter/avatar video | External GPU service | **Blocked pending rights clearance** |
| MuMuAINovel | Long-form campaign/story creative service | External service | Disabled |
| Corey Haines Marketing Skills | SEO, CRO, ads, copy, social, lifecycle and growth skills | `.agents/skills` sync | Disabled |

Exact repository revisions live in `upstreams/bharatshop-upstreams.json` and are mirrored in `src/lib/integrations/upstream-ai.ts`.

## Why service boundaries

- OpenHands can execute code and should run in a sandbox with the minimum required repository permissions. Do not expose production database/payment secrets to an unsandboxed agent.
- Remotion has its own licensing model and rendering can require separate compute. The storefront should call a controlled render worker rather than vendor the whole monorepo.
- MuMuAINovel is GPL-3.0. Keeping it as a separately deployed service avoids casually mixing its application code into BharatShop's core codebase.
- PersonaLive repository code and model documentation have different/restrictive usage signals. BharatShop therefore requires `PERSONALIVE_COMMERCIAL_USE_APPROVED=true` in addition to the normal enable flag before it can become active.
- Marketing Skills are MIT-licensed Agent Skills, so they are synced into an agent-workstation directory and never bundled into the customer storefront.

## Configuration

All integrations are disabled by default. Configure server-side environment variables only:

```text
BHARATSHOP_REMOTION_ENABLED=false
REMOTION_SERVICE_URL=
REMOTION_SERVICE_TOKEN=

BHARATSHOP_OPENHANDS_ENABLED=false
OPENHANDS_AGENT_SERVER_URL=
OPENHANDS_AGENT_SERVER_TOKEN=

BHARATSHOP_PERSONALIVE_ENABLED=false
PERSONALIVE_SERVICE_URL=
PERSONALIVE_SERVICE_TOKEN=
PERSONALIVE_COMMERCIAL_USE_APPROVED=false

BHARATSHOP_MUMU_ENABLED=false
MUMU_AI_SERVICE_URL=
MUMU_AI_SERVICE_TOKEN=

BHARATSHOP_MARKETING_SKILLS_ENABLED=false
```

No secret variable above may use the `NEXT_PUBLIC_` prefix.

## Marketing Skills sync

The repository pins Corey Haines' skills to a reviewed commit. To install that exact revision into `.agents/skills` on a development/agent workstation:

```bash
npm run skills:marketing:sync
npm run skills:marketing:check
```

The sync script downloads only the upstream `skills/` tree and writes a marker containing the exact source commit. It is not executed during storefront builds or deployments.

## Readiness API

`GET /api/integrations/upstream` returns a safe, secret-free readiness summary suitable for the BharatShop cockpit. If `?verify=1` is requested **and** the caller provides the existing BharatShop automation token, the route performs health probes against configured service endpoints. Endpoint values and tokens are never returned.

The current command-centre execution logic is intentionally unchanged in this first integration commit. UI wiring can consume this readiness endpoint without altering the existing automation pathways.

## Production rules

1. No upstream may replace or reseed the BharatShop production database.
2. No upstream may replace BharatShop auth, checkout or payment ownership merely because it is enabled.
3. OpenHands must run sandboxed and least-privileged.
4. PersonaLive stays blocked until its code/model/weight rights are explicitly cleared for the intended commercial use.
5. Upstream version changes require updating the pinned SHA, reviewing the relevant license/README changes and running the standard BharatShop test/typecheck/build/lint gates.
