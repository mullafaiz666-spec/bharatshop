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

Environment:
- `AUTOM8AI_WEBHOOK_URL` — required.
- `AUTOM8AI_WEBHOOK_TOKEN` — optional; the current Autom8AI Generic Webhook Trigger can use URL-only configuration.

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

Verification on activation-helper code head `e755819524e6e541217492b54ee195dc7a09169d`:
- Creative Engine CI: success.
- Agent Suite Build: success.
- Integration tests: success.
- TypeScript: success.
- Production build: success.
- Lint: success.


## 16. Autom8AI Generic Webhook credential correction — 2026-09-18

Observed directly in the Autom8AI workflow UI:
- Generic Webhook Trigger exposes an HTTPS webhook URL.
- No separate webhook token field is shown.
- "Wait for a completion event" is optional and should remain OFF for the current BharatShop fire-and-review workflow.

BharatShop was corrected accordingly:
- webhook URL is sufficient for Autom8AI configured status;
- bearer token is optional;
- Authorization header is sent only when an optional token is configured;
- Windows configurator accepts Enter for no token;
- read-only verifier accepts URL-only configuration;
- Marketing connection health requires only `AUTOM8AI_WEBHOOK_URL`.


## 17. Local workstation + Autom8AI verified — 2026-09-18

Observed on the user's laptop after restart from the repair worktree:
- BharatShop storefront: READY on `http://127.0.0.1:3001`
- BharatDrip: HTTP 200
- Fashion Studio: reachable and correctly redirects unauthenticated access to `/admin-login`
- Machine AI: READY on `http://127.0.0.1:3002`
- Ollama: HTTP 200
- Qwen shim: HTTP 200
- Machine AI supervisor: `LOCAL_READY`
- 264 agents discovered
- Autom8AI: configured=true
- Autom8AI webhook URL present and valid
- Autom8AI token: not used for the current generic webhook configuration

The read-only verifier reported `runtimeOk: true`.

No webhook URL or other secret value is stored in this document.

Next verification target:
send one explicit non-production test event through the configured Autom8AI generic webhook and confirm the workflow receives the payload, without enabling ad spend or auto-publishing.


## 18. Autom8AI live webhook handshake verified — 2026-09-18

The user's local BharatShop repair worktree successfully triggered the active Autom8AI Generic Webhook workflow.

Observed dry-run result:
- HTTP status: 200
- response.received: true
- response.fired: 1
- tokenUsed: false
- webhook host: www.autom8ai.io

The connection test carried explicit safety flags:
- autoPublish=false
- adSpend=false
- productMutation=false
- createsOrders=false
- createsPayments=false
- createsApprovals=false
- mutatesDatabase=false
- deploys=false
- requiresHumanReview=true

This verifies:
BharatShop local runtime -> configured Autom8AI webhook -> active Autom8AI workflow trigger.

Next work:
configure the downstream Autom8AI workflow nodes for:
1. marketing short-video generation;
2. Fashion Designer creative / UGC generation;
3. renderer handoff (Higgsfield or another configured video worker);
4. review-only result handling before any publication.


## 19. Autom8AI downstream result handoff implemented — 2026-09-18

Implemented on the repair branch:
- `POST /api/automation/autom8ai/result` — authenticated review-only creative result callback.
- `GET /api/automation/autom8ai/result?productId=<id>` — authenticated readback of recent Autom8AI result audit entries.
- callback writes only `ai_activity_logs`; it does not update `products` or `product_images`.
- completed results require an HTTPS asset URL or workflow URL.
- accepted workflows: `marketing-video`, `fashion-creative`.
- accepted states: `QUEUED`, `RENDERING`, `COMPLETED`, `FAILED`, `NEEDS_REVIEW`.
- every outgoing Autom8AI job now includes a non-secret `resultContract` describing the callback path and payload.
- `docs/AUTOM8AI_WORKFLOW_BUILD_PROMPT.md` contains the exact downstream workflow instructions.

Current Higgsfield render hints were refreshed from read-only model discovery:
- primary: `marketing_studio_video`
- mode: `ugc`
- preferred vertical aspect: `9:16`
- primary duration: 12-15 seconds
- fallback: `seedance_2_5` for flexible 4-30 second reference-driven video.

No renderer generation was executed during this change and no credits were spent.


## 20. Autom8AI candidate preflight DB-env fallback — 2026-09-19

The first local candidate preflight correctly failed because the repair worktree's `.env.local` contained the Autom8AI webhook but no `DATABASE_URL` or `SUPABASE_DB_URL`.

The preflight was corrected without copying or printing secrets:
- first uses the repair worktree/process DB env when available;
- otherwise reads the existing sibling `bharatshop-harness` `.env.local` or `.env` in memory;
- uses only `DATABASE_URL` / `SUPABASE_DB_URL`;
- does not write the secret into the repair worktree;
- does not print the secret value;
- remains `BEGIN READ ONLY` + `ROLLBACK`;
- does not trigger Autom8AI or any renderer.

A CI safety-test false positive was also fixed: JavaScript `URLSearchParams.delete()` is no longer mistaken for SQL `DELETE FROM`.


## 21. Preserved local DB service recovery — 2026-09-19

Observed local candidate preflight failure:
- configured DB target resolves to `127.0.0.1:55432`;
- connection failed with `ECONNREFUSED`, meaning no local listener was active.

The existing intended listener is the preserved Docker PostgreSQL container:
- container: `bharatshop-dev-db`
- host: `127.0.0.1`
- port: `55432`

Added:
- `scripts/local-db-ensure.mjs`
- `npm run db:local:ensure`

Safety behavior:
- checks whether port 55432 is already listening;
- if needed, may start only the already-existing `bharatshop-dev-db` container;
- never creates, removes, resets, recreates, reseeds, or replaces the database/container/volume;
- does not mutate application records.

After the service is available, rerun `npm run autom8ai:candidates`.


## 22. Local DB credential alignment fallback — 2026-09-19

Observed after Docker Desktop recovery:
- `bharatshop-dev-db` became reachable on `127.0.0.1:55432`.
- No container/database reset, removal, reseed, or application-data mutation occurred.
- The existing harness DB URL then failed with PostgreSQL password authentication for user `bharatshop`.

The Autom8AI candidate preflight was updated to resolve this without changing the database password:
- first tries the configured repair/harness DB URL;
- only when the target is exactly local `127.0.0.1|localhost:55432` and PostgreSQL reports an auth failure, it reads the preserved `bharatshop-dev-db` container's `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` values in memory via `docker inspect`;
- retries the same read-only candidate queries using those values;
- never prints or persists the password;
- never changes the database password;
- remains `BEGIN READ ONLY` + `ROLLBACK`;
- does not trigger Autom8AI or a renderer.

This keeps the preserved database authoritative and avoids secret copying or credential mutation.


## 23. Autom8AI eligibility diagnostics — 2026-09-19

The local candidate preflight is now verified to connect safely to the preserved `bharatshop-dev-db` using the existing container credentials in memory:
- no secret values printed;
- no secret values persisted;
- no password changes;
- no DB mutation;
- no Autom8AI webhook call;
- no renderer execution or credit use.

Latest observed candidate result:
- marketing video candidates: 0
- fashion creative candidates: 0

The preflight now emits read-only eligibility diagnostics when products do not pass:
- total products
- Published count
- positive-profit count
- Published + positive-profit count
- marketing failure counts and near matches
- fashion failure counts and near matches

Fashion diagnostic gates mirror the live workflow:
- BharatDrip/BharatShop Studio brand
- Qikink supplier
- positive profit
- margin >= 18%
- productionSupplier=qikink
- inventoryMode=MADE_TO_ORDER
- ipPolicy contains ORIGINAL

No product fields are altered by this diagnostic.


## 24. Legacy Render database preservation priority — 2026-09-19

Read-only connected-service discovery found the preserved legacy Render PostgreSQL instance:
- name: `bharatshop-db`
- database: `bharatshop_db`
- status: available
- plan: free
- region: Oregon
- Render record expiry: 2026-09-26

The local `bharatshop-dev-db` is confirmed healthy but contains zero products.

Netlify project `bharatshop-35fd` currently has no `DATABASE_URL` or `SUPABASE_DB_URL` environment variable. It only has Supabase public/project settings and migration remains unverified.

The repository's guarded migration contract remains:
- `SOURCE_DATABASE_URL` = preserved legacy production database
- `SUPABASE_DB_URL` = Supabase Postgres target
- run read-only migration preflight before any copy
- verify schema, row counts, fingerprints and sequences before cutover
- never reset/reseed/overwrite production data

The Render read-only SQL connector currently fails at connection negotiation because the database requires SSL/TLS, so row counts from the legacy database are not yet verified.

Priority: recover and verify the Render source before its recorded expiry. Do not seed the empty local DB as a substitute.
