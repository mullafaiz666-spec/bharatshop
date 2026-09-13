# BharatShop Agent Upgrade Pack

Reviewed: 2026-09-13

This upgrade extends the existing BharatShop agent/control-plane architecture without changing production database ownership, authentication, payments, or the Netlify storefront runtime.

## Decisions

| Source | Decision | BharatShop use |
| --- | --- | --- |
| `rohitg00/agentmemory` | Adopt as isolated sidecar | Shared agent memory, project recall, provenance and handoffs. Disabled until a private endpoint is configured. |
| `volcengine/OpenViking` | Do not merge code | Valuable context-database ideas, but it overlaps AgentMemory and is AGPL-3.0. Keep outside BharatShop runtime pending a deliberate AGPL architecture review. |
| `browser-use/browser-use` | Adopt Agent Skill | Install the pinned `browser-use` skill on agent workstations. Browser execution remains outside Netlify and needs a separately configured Browser Use runtime. |
| `ai-boost/awesome-harness-engineering` | Adopt engineering patterns only | Reference material for evals, permissions, memory boundaries, verification and agent harness design. It is not a runtime dependency. |
| `cathrynlavery/diagram-design` | Adopt Agent Skill | Architecture, data-flow, deployment and workflow diagrams for BharatShop engineering/operations. |
| `K-Dense-AI/scientific-agent-skills` | Selective adoption | Only `statsmodels` and `scientific-visualization` are synced. The full scientific bundle is intentionally excluded. |

Exact reviewed revisions are recorded in `upstreams/bharatshop-upstreams.json`.

## Install the workstation skills

```bash
npm run skills:upgrades:sync
npm run skills:upgrades:check
```

The sync is additive: it updates only the four approved skill directories and its own marker file under `.agents/skills`. It does not delete the existing marketing skills.

## AgentMemory

AgentMemory is opt-in and disabled by default. Run it as a private/local service, then configure server-side values only:

```env
BHARATSHOP_AGENTMEMORY_ENABLED=true
AGENTMEMORY_URL=http://127.0.0.1:3111
AGENTMEMORY_SECRET=
```

BharatShop probes `/agentmemory/health`. AgentMemory may store agent working memory and handoff context, but PostgreSQL remains the source of truth for customers, products, orders, payments and operational business data.

## Safety boundaries

- No production database reset, migration or schema cutover is part of this upgrade.
- No authentication or payment provider is replaced.
- No new runtime dependency is added to the customer-facing Next.js bundle.
- Browser automation does not receive production credentials by default.
- OpenViking code is not vendored or started by BharatShop.
- Scientific skills remain a narrow allowlist rather than a bulk import.
- All new capability flags default to `false`.

## Verification

The normal PR build remains authoritative:

```bash
npm ci
npm run test:integrations
npm run typecheck
npm run build
npm run lint
```

GitHub Actions runs this sequence on pull requests to `main`.
