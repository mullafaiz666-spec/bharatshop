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


## Autom8AI creative orchestration — 2026-09-18

Autom8AI has been added as a review-only orchestration layer for both BharatShop Marketing and the Fashion Designer.

Files:
- `src/lib/autom8ai.ts`
- `src/app/api/automation/autom8ai/route.ts`
- `tests/autom8ai-integration.test.mjs`
- `docs/AUTOM8AI_CREATIVE_ORCHESTRATION.md`
- Marketing and Fashion cockpit UI integrations
- `.env.example` Autom8AI configuration placeholders

Live execution requires:
- `AUTOM8AI_WEBHOOK_URL`

Optional:
- `AUTOM8AI_WEBHOOK_TOKEN` — only if the chosen webhook/provider adds bearer-token protection.

Autom8AI does not replace Higgsfield or another renderer. It orchestrates the job and can call the configured renderer.

Safety boundaries:
- no automatic product publication
- no ad spend
- no pricing/supplier mutation
- no bypass of Fashion IP/profitability/Qikink gates
- no read-only connection probe that triggers a workflow
- webhook secret remains server-side

The Autom8AI code head passed integration tests, TypeScript, production build, lint, Creative Engine CI and Agent Suite Build.

Next activation step:
configure the Autom8AI webhook URL/token locally (without committing them), then send one explicit test marketing-video or fashion-creative job and verify the remote job ID/output.


## Autom8AI local activation helper — 2026-09-18

BharatShop now includes a PowerShell-first, secret-safe Autom8AI activation path.

Commands:
- `npm run autom8ai:configure:windows` — prompts for webhook URL/token and writes them only to ignored `.env.local`.
- `npm run local:verify:readonly` — checks Store 3001, Machine AI 3002, Ollama, Qwen shim, BharatDrip/Fashion route reachability, and Autom8AI configuration without triggering workflows.

The token is never printed by the helper. Existing `.env.local` is backed up before the two Autom8AI keys are updated.

Live Autom8AI execution still requires the real webhook URL and token from the user's Autom8AI workflow.

The activation-helper code head `e755819524e6e541217492b54ee195dc7a09169d` passed Creative Engine CI and the full Agent Suite Build, including integration tests, TypeScript, production build, and lint.


## Autom8AI credential correction — 2026-09-18

The user's actual Autom8AI Generic Webhook Trigger configuration screen shows a generated HTTPS webhook URL and no separate webhook-token field.

Project behavior was corrected:
- URL-only generic webhook is valid.
- `AUTOM8AI_WEBHOOK_TOKEN` is optional.
- BharatShop sends an Authorization header only when a token is configured.
- Local configuration accepts a blank token and removes any stale token from `.env.local`.
- Read-only verification considers a valid webhook URL sufficient for Autom8AI configuration.

For the current workflow, leave "Wait for a completion event" OFF because BharatShop expects an immediate accepted/queued response and reviews resulting assets separately.


## Local workstation + Autom8AI verified — 2026-09-18

The clean repair worktree was restarted and verified successfully on the user's laptop.

Verified runtime:
- Store / BharatDrip / Fashion Studio: port 3001
- Machine AI: port 3002
- Ollama: ready
- Qwen shim: ready
- Supervisor: LOCAL_READY
- Agents: 264
- Read-only runtime verification: true
- Autom8AI: configured
- Current Autom8AI generic webhook uses URL-only configuration; no bearer token is in use

The webhook URL itself is intentionally not recorded in project memory.

Next step is a safe, explicit Autom8AI test event only. No ad spend, product publication, order creation, payment creation, approval creation, database mutation, or deployment should occur during that test.


## Autom8AI live webhook handshake verified — 2026-09-18

The live Generic Webhook Trigger is now confirmed working from the BharatShop repair worktree.

Safe dry-run result:
- HTTP 200
- received=true
- fired=1
- no bearer token used
- no ad spend, publishing, product mutation, order/payment/approval creation, database mutation, or deployment

Autom8AI connectivity is therefore no longer a blocker.

Next milestone is downstream workflow execution: take the received BharatShop event and route marketing/fashion requests to the configured creative/video renderer, with human review before publication.


## Autom8AI downstream result handoff implemented — 2026-09-18

The repair branch now has a review-only result channel from Autom8AI back into BharatShop:
- `POST /api/automation/autom8ai/result`
- `GET /api/automation/autom8ai/result?productId=<id>`

The callback requires existing BharatShop automation authentication and records result evidence only in `ai_activity_logs`. It cannot mutate products, replace product images, auto-publish, spend ads, create orders, or create payments.

Outgoing Autom8AI jobs include a non-secret result contract.

The current Higgsfield target discovered through the connected read-only model catalog is `marketing_studio_video` with `ugc` mode for 12-15 second vertical social/product videos. `seedance_2_5` is the fallback for longer 4-30 second reference-driven video.

No media generation or credit-spend action was performed while wiring this architecture.


## Preserved local DB service recovery — 2026-09-19

The Autom8AI candidate preflight reached the existing local DB configuration but received `ECONNREFUSED 127.0.0.1:55432`.

That listener belongs to the preserved local PostgreSQL Docker container `bharatshop-dev-db`.

A safe helper now exists:
- `npm run db:local:ensure`

It may start only the existing container. It cannot create/reset/reseed/remove/replace the database or volume. After it succeeds, `npm run autom8ai:candidates` should be rerun.


## Local DB credential alignment fallback — 2026-09-19

The preserved `bharatshop-dev-db` container is now reachable on `127.0.0.1:55432`. The remaining failure was password authentication for user `bharatshop`.

The candidate preflight now performs a secret-safe local-only retry using the existing container's own `POSTGRES_*` environment values in memory. It does not print/persist those values and does not alter the database password, container, volume, or records.


## Autom8AI eligibility diagnostics — 2026-09-19

The Autom8AI preflight successfully connected to the preserved local database and returned zero eligible marketing/fashion candidates. This is now treated as an eligibility-data issue rather than a connectivity issue.

The preflight now reports exact failed gates and near matches, read-only, so the next step can identify which existing products are closest to eligibility before any product mutation is considered.


## Legacy Render database preservation priority — 2026-09-19

Connected-service discovery found the old Render PostgreSQL instance `bharatshop-db` still available. Its Render record shows expiry on 2026-09-26.

The local preserved Docker DB is healthy but currently has zero products. Netlify has no active server-side PostgreSQL URL configured.

The next priority is to recover/verify the Render database as `SOURCE_DATABASE_URL` and the Supabase Postgres target as `SUPABASE_DB_URL`, then use the existing read-only migration preflight and parity verification. Do not reseed the local DB or cut over until source data is verified.
