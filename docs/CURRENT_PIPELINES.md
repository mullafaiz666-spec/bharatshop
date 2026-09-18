# BharatShop Current Pipelines

_Last updated: 2026-09-18_

This file is the canonical snapshot for the current local-first BharatShop architecture on branch `repair/reconcile-20260918`. Update this file whenever a pipeline, route, runtime, dependency, or deployment decision materially changes.

## 1. Local Machine AI runtime

Status: **LOCAL_READY verified**

Pipeline:

```
Machine AI UI :3002
  -> machine-ai-web-manager.mjs
  -> machine-ai-web.mjs
  -> Machine AI supervisor
  -> Ollama 127.0.0.1:11434
  -> qwen3.5:4b
  -> Qwen compatibility shim 127.0.0.1:11555
  -> local agency catalog
  -> 264 discovered agents
  -> task queue / local execution
```

Verified runtime state on 2026-09-18:
- Supervisor running successfully.
- Ollama READY.
- Qwen shim READY.
- 264 agents discovered.
- Machine AI state reported `LOCAL_READY`.
- Startup entry intentionally not installed while startup behavior is being stabilized.

Windows flashing fix:
- Visible child-process spawning was traced to `windowsHide: false`.
- `scripts/machine-ai-manager.mjs` uses hidden Windows child processes.
- `scripts/machine-ai-supervisor.mjs` has all five affected child-process launch points changed to `windowsHide: true`.
- Old competing Startup-folder launchers were disabled.

Do not re-enable old BharatShop Startup `.cmd` launchers unless the single-runtime startup design is intentionally restored.

## 2. Local BharatShop storefront runtime

Status: **implemented; run/verify locally before deployment**

Pipeline:

```
local-storefront-manager.mjs
  -> Next.js production build
  -> 127.0.0.1:3001
  -> BharatShop routes
  -> admin/dashboard routes
  -> BharatDrip storefront
```

Local URL:
- BharatShop root: `http://127.0.0.1:3001`
- BharatDrip: `http://127.0.0.1:3001/bharatdrip`
- Fashion Designer cockpit: `http://127.0.0.1:3001/dashboard/fashion`

The storefront manager launches its Windows process with `windowsHide: true`.

## 3. BharatDrip storefront

Status: **live database connection implemented and CI-verified on the repair branch; local laptop runtime verification pending**

Primary code:
- `src/app/bharatdrip/`
- `src/components/bharatdrip/`
- `src/lib/bharatdrip/products.ts`
- `src/lib/bharatdrip/live-products.ts`

Current storefront flow:

```
/bharatdrip
  -> getLiveBharatDripProducts()
  -> Published + brand=BharatDrip database products
  -> verified fashion images / real pricing / sizes / metadata
  -> themed BharatDrip product cards and live detail routes
  -> static themed catalogue as safe fallback
```

Published Fashion Designer drops now appear in the dedicated BharatDrip theme. Live product detail routes use:
`/bharatdrip/products/live-<id>-<slug>`

New live drops do not receive invented ratings or customer reviews.

## 4. BharatDrip Fashion Designer AI

Status: **implemented and connected to database/listing pipeline**

Admin route:
- `/dashboard/fashion`
- Redirects to `/admin-login` when no admin session exists.

Main UI:
- `src/components/FashionAgentCockpit.tsx`
- `src/components/FashionDesignerStudio.tsx`

Primary APIs:
- `/api/admin/fashion-agent`
- `/api/admin/fashion-studio`
- `/api/fashion-designer`
- supporting fashion-art/photo automation routes

Pipeline:

```
Fashion trend intelligence
  -> streetwear direction
  -> Qikink garment selection
  -> Qikink costing
  -> original design brief
  -> IP safety gate
  -> profitability gate
  -> Higgsfield UGC prompt packet / creative attachment
  -> product DB record
  -> product details / images
  -> CEO_PENDING or Published
  -> BharatShop listing
```

Current policy:
- Original artwork only.
- Third-party brand/franchise/IP references are blocked by the studio/agent checks.
- Qikink is the made-to-order production supplier mapping.
- Profit and margin checks run before listing.
- Higgsfield is the intended creative provider for UGC imagery; prompt packets are generated and resulting HTTPS assets can be attached.

## 5. Qikink production pipeline

Primary code:
- `src/lib/suppliers/qikink-rate-card.ts`

Flow:

```
garment / audience / print method
  -> Qikink product code
  -> garment base cost
  -> printing cost
  -> shipping / COD / GST
  -> landed cost
  -> price floor / margin check
  -> design/listing decision
```

Fashion Designer uses this rate mapping before creating or publishing made-to-order products.

## 6. Product listing flow for AI fashion drops

Current working flow:

```
Trend / studio concept
  -> design plan
  -> Qikink economics
  -> IP check
  -> profitability check
  -> DB INSERT products
  -> DB INSERT product_details
  -> DB INSERT product_images
  -> AI activity log
  -> CEO_PENDING or Published
  -> general BharatShop store
  -> when Published + brand=BharatDrip: dedicated /bharatdrip theme
```

BharatDrip live products are treated as Qikink made-to-order products by the storefront order gateway, so zero warehouse stock does not incorrectly block an order.

## 7. Agent/runtime safety model

Current direction:
- One Machine AI supervisor.
- One Machine AI web UI.
- Ollama loaded only as needed by the local runtime.
- Avoid duplicate 24x7 supervisors and duplicate startup launchers.
- Machine AI and BharatShop storefront are separate local processes:
  - AI UI: port 3002
  - BharatShop app: port 3001

## 8. Git / reconciliation state

Active repair branch:
- `repair/reconcile-20260918`

Important local state observed on 2026-09-18:
- The main working directory had local modified and untracked files that blocked a fast-forward pull.
- The repair branch is also attached to a separate worktree at:
  `C:/Users/faizm/bharatshop-repair-20260918`
- Do not force-reset or overwrite these local changes.
- Reconcile/stash/commit intentionally before pulling branch changes into the main working directory.

Durable flashing-window fix was also committed to the repair branch for `scripts/machine-ai-supervisor.mjs`.

## 9. Deployment decision pipeline

Current operating rule:

```
local source reconciliation
  -> local build
  -> local storefront run
  -> Machine AI/runtime verification
  -> route/API checks
  -> DB/payment/integration checks
  -> production-data safety review
  -> final decision:
       DEPLOY
       or
       KEEP MODIFYING LOCALLY
```

A successful `npm run build` alone is not sufficient to deploy.

Target hosting remains Netlify for the current BharatShop deployment path unless explicitly changed.

## 10. Next highest-priority work

1. Reconcile the dirty `bharatshop-harness` working tree safely without overwriting local changes.
2. Pull and verify the current repair branch in the separate repair worktree.
3. Run the complete local workstation with BharatShop on port 3001 and Machine AI on port 3002.
4. Verify Fashion Designer -> publish -> live BharatDrip display against the actual local database.
5. Verify the live BharatDrip protected checkout with configured test/sandbox payment credentials; do not create real production payments during verification.
6. Verify auth, database, admin, order persistence, payment callbacks and remaining external integrations.
7. Run final production acceptance and decide DEPLOY or KEEP MODIFYING LOCALLY.

## Update rule

Whenever a major BharatShop change is made, update this file with:
- pipeline changed,
- files/routes changed,
- verified state,
- unresolved gap,
- next action,
- date.


## 11. Local live-port correction — 2026-09-18

Observed on the user's current laptop runtime:
- BharatShop / BharatDrip storefront: `http://127.0.0.1:3001`
- Machine AI web UI: `http://127.0.0.1:3002`

The command `npm run local:storefront:start` is not available in the user's current `bharatshop-harness` working tree because the earlier branch switch/pull did not complete. The repair branch contains that script, but the user's active working tree still has local changes and must not be force-overwritten.




## 12. BharatDrip live catalogue + protected checkout — 2026-09-18

Implemented and CI-verified on `repair/reconcile-20260918`:
- Added `src/lib/bharatdrip/live-products.ts`.
- `/bharatdrip` now loads published database products for brand/design origin BharatDrip before the static themed fallback catalogue.
- Live products retain the BharatDrip design and use dedicated live detail routes.
- Live AI-created products use real database prices, sizes, Qikink metadata and verified fashion imagery.
- New live drops display no fabricated ratings/reviews.
- The cart rehydrates live items from the canonical current catalogue rather than trusting prices stored in localStorage.
- The storefront order gateway recognizes both BharatShop Studio and BharatDrip as Qikink made-to-order fashion.
- Live BharatDrip products use the existing protected partial-COD order/payment path.
- Razorpay success is shown only after backend payment verification.
- Cashfree uses the existing hosted checkout path.
- No unprotected plain-COD fallback is used when payment providers are not configured.
- Legacy static BharatDrip showcase products remain browse/preview-only until they are migrated into the live database catalogue.

Verification:
- Creative Engine CI: success.
- Integration tests: success.
- TypeScript: success.
- Production build: success.
- Lint: success.
- Agent Suite Build: success.
- Local laptop runtime/payment-provider verification remains required before deployment.

## 13. Local port map and one-command workstation — 2026-09-18

Canonical local ports:
- BharatShop / BharatDrip / Fashion Studio: `127.0.0.1:3001`
- Machine AI UI: `127.0.0.1:3002`
- Ollama: `127.0.0.1:11434`
- Qwen shim: `127.0.0.1:11555`

The repair branch now pins these defaults in the local managers, `.env.example`, and regression tests.

One-command local runtime:
- `npm run local:workstation:start`
- `npm run local:workstation:status`
- `npm run local:workstation:stop`

`scripts/local-workstation-manager.mjs` starts the Machine AI supervisor, Machine AI web UI and BharatShop storefront through the existing hidden-window managers. It does not reinstall the old Startup-folder launchers.

Latest CI for the port map + workstation manager:
- Integration tests: success.
- TypeScript: success.
- Production build: success.
- Lint: success.
- Creative Engine CI: success.
- Agent Suite Build: success.


## 14. Autom8AI creative orchestration — 2026-09-18

Status: **implemented and CI-verified on the repair branch; external webhook credentials still required for live execution**

Purpose:
Autom8AI is the orchestration layer for:
- Marketing short-video generation.
- Fashion Designer creative / UGC workflow handoff.

Architecture:

```
Marketing Cockpit / Fashion Designer
  -> /api/automation/autom8ai
  -> BharatShop eligibility + IP + profitability gates
  -> src/lib/autom8ai.ts
  -> configured Autom8AI webhook
  -> Autom8AI workflow
  -> Higgsfield or another configured image/video renderer
  -> returned job/workflow/asset metadata
  -> human review
  -> existing BharatShop publication/ad connectors
```

Required environment variables:
- `AUTOM8AI_WEBHOOK_URL`
- `AUTOM8AI_WEBHOOK_TOKEN`

Marketing:
- Marketing cockpit now exposes **Autom8AI video**.
- Only Published products with positive recorded profit can be sent.
- Payload contains product, target audience, hook, CTA, verified/current imagery and short-video render hints.
- No ad spend or publication is enabled by this handoff.

Fashion:
- Fashion Designer catalogue cards now expose **Autom8AI creative**.
- Only BharatDrip/BharatShop Studio + Qikink + MADE_TO_ORDER products can be sent.
- Original-art policy and profitability are rechecked server-side.
- Payload includes garment, print method, artwork direction, trend, palette and current images.
- Autom8AI is not permitted to change product status, pricing, supplier data or publish automatically.

Safety:
- webhook requests carry a bearer token from server-side environment only.
- webhook URL must use HTTPS except localhost.
- read-only connection verification never triggers Autom8AI.
- external responses are whitelisted to job/status/HTTPS asset/workflow fields; secrets/raw provider data are not surfaced.
- returned output is review-only.

Verification on code head `fc9071019f23e79c462c5f89516f55e621c141de`:
- dependency gate: success
- integration tests: success
- TypeScript: success
- production build: success
- lint: success
- Creative Engine CI: success
- Agent Suite Build: success

Documentation:
- `docs/AUTOM8AI_CREATIVE_ORCHESTRATION.md`


## 15. Autom8AI local activation helper — 2026-09-18

Added:
- `scripts/configure-autom8ai.ps1`
- `scripts/local-readonly-verify.mjs`
- `npm run autom8ai:configure:windows`
- `npm run local:verify:readonly`

Activation behavior:
- prompts interactively for the Autom8AI webhook URL;
- prompts for the webhook token with `Read-Host -AsSecureString`;
- never prints the token;
- validates HTTPS except for localhost;
- writes only to ignored `.env.local`;
- backs up an existing `.env.local` before editing;
- preserves unrelated local environment variables.

Read-only verification checks:
- BharatShop storefront on port 3001;
- BharatDrip;
- Fashion Studio route reachability;
- Machine AI on port 3002;
- Ollama on port 11434;
- Qwen shim on port 11555;
- whether Autom8AI URL/token are configured, without displaying the token.

The verifier never triggers the Autom8AI webhook, creates orders/payments/approvals, mutates the database, or deploys.
