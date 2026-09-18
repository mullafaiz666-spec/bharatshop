# BharatShop Current Pipelines

_Last updated: 2026-09-18_

This file is the canonical snapshot for the current local-first BharatShop architecture on branch `repair/reconcile-20260918`. Update this file whenever a pipeline, route, runtime, dependency, or deployment decision materially changes.

## 1. Local Machine AI runtime

Status: **LOCAL_READY verified**

Pipeline:

```
Machine AI UI :3001
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
  -> 127.0.0.1:3000
  -> BharatShop routes
  -> admin/dashboard routes
  -> BharatDrip storefront
```

Local URL:
- BharatShop root: `http://127.0.0.1:3000`
- BharatDrip: `http://127.0.0.1:3000/bharatdrip`
- Fashion Designer cockpit: `http://127.0.0.1:3000/dashboard/fashion`

The storefront manager launches its Windows process with `windowsHide: true`.

## 3. BharatDrip storefront

Status: **present and visually implemented; dynamic product connection incomplete**

Primary code:
- `src/app/bharatdrip/`
- `src/components/bharatdrip/`
- `src/lib/bharatdrip/products.ts`

Current storefront flow:

```
/bharatdrip
  -> Storefront component
  -> static BharatDrip product catalogue
  -> product cards / product detail pages
```

Important current gap:
- The dedicated `/bharatdrip` storefront still reads the static catalogue in `src/lib/bharatdrip/products.ts`.
- Newly created BharatDrip products written by the Fashion Designer AI are not yet loaded dynamically by this dedicated storefront.

Target connection:

```
Fashion Designer AI
  -> products + product_details + product_images
  -> brand = BharatDrip
  -> approval / listing gate
  -> dynamic /bharatdrip catalogue
```

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
```

Known missing final link:
- The same live database products must feed the dedicated `/bharatdrip` theme automatically.

## 7. Agent/runtime safety model

Current direction:
- One Machine AI supervisor.
- One Machine AI web UI.
- Ollama loaded only as needed by the local runtime.
- Avoid duplicate 24x7 supervisors and duplicate startup launchers.
- Machine AI and BharatShop storefront are separate local processes:
  - AI UI: port 3001
  - BharatShop app: port 3000

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

1. Reconcile the dirty `bharatshop-harness` working tree safely with the repair branch.
2. Preserve the hidden-window Machine AI fix during reconciliation.
3. Start and smoke-test the local BharatShop app on port 3000.
4. Convert `/bharatdrip` from static product data to live BharatDrip database products.
5. Verify Fashion Designer -> DB -> BharatDrip automatic publishing/display path.
6. Run full local production acceptance before any deployment decision.

## Update rule

Whenever a major BharatShop change is made, update this file with:
- pipeline changed,
- files/routes changed,
- verified state,
- unresolved gap,
- next action,
- date.
