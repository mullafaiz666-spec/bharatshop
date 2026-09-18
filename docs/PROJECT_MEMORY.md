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

Current state:
The dedicated BharatDrip storefront now loads Published database products for brand/design origin BharatDrip through `src/lib/bharatdrip/live-products.ts`, while retaining the original static themed catalogue as a fallback.

Implemented flow:
Fashion Designer -> DB -> approval/listing gate -> Published -> live BharatDrip themed catalogue -> protected live-product checkout.

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
-> Published BharatDrip products -> dedicated /bharatdrip themed catalogue

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

1. Reconcile the dirty local `bharatshop-harness` worktree safely.
2. Preserve all verified Machine AI and local-port fixes during reconciliation.
3. Pull/verify the repair branch in `C:/Users/faizm/bharatshop-repair-20260918`.
4. Run the full workstation locally: BharatShop 3001 + Machine AI 3002.
5. Verify Fashion Designer -> database -> Published -> BharatDrip live display against the real local database.
6. Verify live BharatDrip protected checkout using test/sandbox payment configuration only.
7. Verify auth, admin, order persistence, payments and remaining integrations.
8. Run full production acceptance.
9. Only then decide DEPLOY or KEEP MODIFYING LOCALLY.

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

Verification completed on the repair branch:
- integration tests passed
- TypeScript passed
- production build passed
- lint passed
- Creative Engine CI passed
- Agent Suite Build passed
- live BharatDrip cart uses canonical catalogue data
- BharatDrip is recognized as Qikink made-to-order by the real storefront order gateway
- live BharatDrip checkout uses the protected partial-COD payment flow

Still to verify before production:
- local laptop runtime after safe worktree reconciliation
- actual local database Fashion Designer -> publish -> BharatDrip display
- payment provider flow with test/sandbox credentials
- auth/admin/order persistence and remaining external integrations
- final production acceptance


## One-command local workstation — 2026-09-18

Canonical local mapping is now encoded in the repair branch:
- BharatShop / BharatDrip / Fashion Studio: port 3001
- Machine AI: port 3002
- Ollama: port 11434
- Qwen shim: port 11555

Added:
- `scripts/local-workstation-manager.mjs`
- `npm run local:workstation:start`
- `npm run local:workstation:status`
- `npm run local:workstation:stop`

The manager uses the existing hidden-window process managers and does not restore the old competing Startup-folder CMD launchers.

## CI milestone — 2026-09-18

Latest repair-branch changes for BharatDrip live products, protected checkout, local port corrections and the one-command workstation passed:
- dependency vulnerability gate
- integration test suite
- TypeScript
- Next.js production build
- lint
- Creative Engine CI
- Agent Suite Build

This is branch-level verification, not yet local-laptop or production verification.
