# BharatShop Project Memory

_Last updated: 2026-09-18_

This file is the durable project memory for BharatShop. It complements `docs/CURRENT_PIPELINES.md`.

## Memory rules

- Treat this file as the canonical high-level project memory.
- Never store secrets, tokens, passwords, API keys, database passwords, session cookies, or private customer data here.
- Record secret **names/requirements only**, never values.
- Update this file after material architectural, deployment, runtime, integration, database, UI, agent, or workflow changes.
- Prefer verified state over assumptions.
- Mark uncertain items as NOT VERIFIED.
- Do not overwrite local changes or production data to make the memory match the repo.
- The user's live laptop state takes precedence over stale documentation when directly observed.

## Project identity

Primary project: BharatShop.

Primary local working directory currently used by the user:
`C:\Users\faizm\bharatshop-harness`

GitHub repository:
`mullafaiz666-spec/bharatshop`

Current reconciliation branch:
`repair/reconcile-20260918`

Separate repair worktree observed:
`C:/Users/faizm/bharatshop-repair-20260918`

Primary deployment platform for the current architecture: Netlify, unless explicitly changed later.

## Current local port map

Observed live state on the user's laptop:

- BharatShop / BharatDrip / Fashion Studio: `http://127.0.0.1:3001`
- Machine AI web UI: `http://127.0.0.1:3002`
- Ollama: `http://127.0.0.1:11434`
- Qwen compatibility shim: `http://127.0.0.1:11555`

Do not assume older port mappings are still correct.

## Machine AI

Current model:
`qwen3.5:4b`

Verified state on 2026-09-18:
- Machine AI supervisor reached `LOCAL_READY`.
- Ollama: READY.
- Qwen shim: READY.
- 264 agents discovered.
- Pending tasks: 0 during latest verification.
- Completed tasks: 4 during latest verification.

Primary runtime files:
- `scripts/machine-ai-manager.mjs`
- `scripts/machine-ai-supervisor.mjs`
- `scripts/machine-ai-web-manager.mjs`
- `scripts/machine-ai-web.mjs`
- `services/ollama-qwen-shim/server.mjs`

Machine AI UI is separate from the BharatShop storefront.

## Windows flashing-terminal fix

Root cause identified:
Machine AI child processes used `windowsHide: false`, causing visible console windows to flash during repeated supervisor operations.

Local fix applied:
- `scripts/machine-ai-manager.mjs`: visible child process setting changed to hidden.
- `scripts/machine-ai-supervisor.mjs`: five affected launch points changed to `windowsHide: true`.

Durable branch fix:
- Repair branch copy of `scripts/machine-ai-supervisor.mjs` updated so all five relevant `windowsHide` entries are true.

Old competing Startup-folder launchers were disabled, including:
- BharatShop-Agency-24x7.cmd
- BharatShop-Local-Machine-AI.cmd
- BharatShop-Company-Brain-v2.cmd
- BharatShop-Machine-AI-Operational.cmd
- BharatShop-Machine-AI-Web.cmd

Do not re-enable duplicate startup launchers unless the startup architecture is intentionally redesigned.

## Local resource notes

Ollama / llama-server can use multiple GB of RAM while the local model is loaded.
Docker/WSL were previously consuming additional memory and were shut down during troubleshooting.
Model unloading is safe when the local AI is not needed; it does not delete the model.

## BharatShop application

Framework: Next.js.

Primary local storefront / app URL:
`http://127.0.0.1:3001`

Key areas include:
- Storefront
- Admin
- Fashion Designer
- BharatDrip
- Product/catalog APIs
- Checkout/order APIs
- Agents/automation APIs
- Payments/integration status APIs
- Supplier sourcing
- Shopify sync
- Marketing/creative systems

## BharatDrip

Dedicated storefront route:
`/bharatdrip`

Primary code:
- `src/app/bharatdrip/`
- `src/components/bharatdrip/`
- `src/lib/bharatdrip/products.ts`

Product detail route:
`/bharatdrip/products/[slug]`

Current important gap:
The dedicated BharatDrip storefront still reads static product data from `src/lib/bharatdrip/products.ts`.
AI Fashion Designer products are written into the database/general store pipeline but are not yet automatically surfaced in the dedicated BharatDrip themed storefront.

Target:
Fashion Designer -> DB -> approval/listing gate -> live BharatDrip catalogue.

## Fashion Designer AI / Fashion Studio

Admin route:
`/dashboard/fashion`

Admin authentication is required; unauthenticated users are redirected to `/admin-login`.

Primary UI:
- `src/components/FashionAgentCockpit.tsx`
- `src/components/FashionDesignerStudio.tsx`

Primary APIs:
- `src/app/api/admin/fashion-agent/route.ts`
- `src/app/api/admin/fashion-studio/route.ts`
- `src/app/api/fashion-designer/route.ts`
- fashion art/photo automation routes

Pipeline:
Trend intelligence
-> Qikink garment selection
-> design plan
-> original-art/IP safety checks
-> profitability checks
-> Higgsfield creative prompt / image attachment
-> products/product_details/product_images
-> CEO_PENDING or Published
-> general BharatShop listing
-> future dynamic BharatDrip listing

## Qikink

Qikink is the current made-to-order supplier mapping for Fashion Designer flows.

Primary rate-card code:
`src/lib/suppliers/qikink-rate-card.ts`

The rate card maps:
- garment code
- audience
- sizes
- base garment cost
- printing method/cost
- shipping
- COD
- GST
- landed cost

Used for profitability gating before creation/listing.

## Higgsfield / creative pipeline

Fashion Designer generates Higgsfield-ready UGC prompt packets.
Current intended models recorded in code:
- final: Nano Banana Pro
- batch: Nano Banana 2

The deployed app does not assume undocumented Higgsfield API fields.
Resulting HTTPS image assets can be attached to BharatDrip products.

## Product creation / listing

Fashion AI product creation writes to:
- `products`
- `product_details`
- `product_images`
- `ai_activity_logs`

Typical status:
- CEO_PENDING
- Published

Policies:
- Original artwork only.
- Third-party brand/franchise/IP references are blocked by fashion-agent/studio checks.
- Profitability and margin floors are checked before listing.
- Qikink made-to-order products may have zero physical inventory.

## Git/worktree state

Important current state:
- The main working directory has local modified files and untracked files.
- A previous `git pull --ff-only` was blocked because pulling would overwrite those changes.
- The repair branch is already attached to a separate worktree.
- Do not force reset, clean, or overwrite the working tree.
- Reconcile by reviewing/stashing/committing/cherry-picking intentionally.

Files previously reported as locally modified included:
- eslint.config.mjs
- machine-ui/app.js
- scripts/machine-ai-web-manager.mjs
- scripts/machine-ai-web.mjs
- scripts/personal-ai.mjs
- tests/machine-ai-web.test.mjs

Previously reported untracked files included:
- scripts/agency-reliability.mjs
- scripts/machine-ai-chat-acceptance.mjs
- scripts/machine-ai-transport.mjs
- scripts/machine-ai-web-readiness.mjs

This list can become stale; re-check before acting.

## Local npm script mismatch

The user's active worktree reported:
`npm error Missing script: "local:storefront:start"`

The repair branch contains a local storefront manager/script, but the current active working tree had not pulled those changes because reconciliation was blocked.

Do not assume branch package.json equals the active local package.json until reconciliation completes.

## Production data safety

Never:
- drop production DB
- reset production DB
- wipe tables
- destructively reseed production
- overwrite real customer/order/product data
- run destructive migrations without explicit approval
- replace production data merely to satisfy tests

Inspect migrations before applying.

## Deployment rule

Do not deploy only because `npm run build` succeeds.

Required decision path:
local reconciliation
-> build
-> local runtime
-> route/API verification
-> auth verification
-> DB verification
-> product/cart/checkout/order verification
-> payment/integration verification
-> agent/runtime verification
-> production-data safety review
-> DEPLOY or KEEP MODIFYING LOCALLY

## Known current priorities

1. Reconcile the dirty local worktree safely.
2. Preserve the Machine AI hidden-window fix.
3. Stabilize the local port/runtime mapping.
4. Verify BharatShop app on :3001 and Machine AI on :3002 together.
5. Connect Fashion Designer DB products into the dedicated `/bharatdrip` storefront.
6. Verify product -> cart -> checkout -> order -> database -> admin.
7. Verify authentication and authorization paths.
8. Verify payment readiness without unsafe production actions.
9. Verify external integrations and required environment variables.
10. Run full production acceptance before deploying.

## User workflow preference

The user prefers:
- one command when possible
- continuation from current project state instead of rebuilding
- local verification before deployment
- safe handling of production data
- free/low-cost infrastructure where practical
- PowerShell-first laptop workflows
- GitHub as project source control
- keeping Machine AI integrated with BharatShop
- durable project memory so prior work does not have to be re-explained

## Related durable docs

- `docs/CURRENT_PIPELINES.md` — canonical current pipeline snapshot
- `docs/PROJECT_MEMORY.md` — durable project-wide memory (this file)

## Update discipline

Whenever a major change is made, update the appropriate durable docs with:
- date
- what changed
- files/routes changed
- verified result
- unresolved issue
- next action

For decisions that materially change architecture, also record the reason so future work does not accidentally reverse the decision.


## BharatDrip live database connection — 2026-09-18

The previously missing Fashion Designer -> DB -> dedicated BharatDrip storefront connection has now been implemented on the repair branch.

Current flow:
Fashion Designer AI
-> Qikink costing / IP / profitability gates
-> product + details + images in DB
-> status Published
-> `getLiveBharatDripProducts()`
-> themed `/bharatdrip` catalogue
-> dedicated `/bharatdrip/products/live-...` detail route

Static BharatDrip catalogue entries remain as safe fallback content. New live database drops do not receive invented ratings/reviews.

Still to verify before production:
- branch CI after latest type fix
- local laptop build/runtime on the reconciled worktree
- BharatDrip live-product cart/checkout/order persistence
