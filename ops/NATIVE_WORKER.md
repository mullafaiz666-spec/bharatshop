# Native BharatShop agent execution

The target is the existing Next.js app on Netlify, the preserved production
schema/data on Supabase PostgreSQL, hosted Gemini, and the existing shared agent
queue executed by a standard GitHub Actions runner. Long agent runs no longer
need to fit inside a Netlify HTTP request. This is an execution adapter for the
existing agents, not a second application or a replacement database.

## What is implemented

- `.github/workflows/native-company-worker.yml`: one task every six hours or by
  manual dispatch. No execution until BOTH activation variables are true.
- `scripts/run-native-company-worker.mjs`: validates configuration, bundles the
  existing runtime, checks the accepted native app revision and provider health,
  then starts the worker. It never points at Render or a desktop model.
- On Netlify, Command Centre run-agent/growth actions enqueue work; queue-run requests do not claim it. The UI reports QUEUED rather than completion.
- Worker atomically claims one existing PostgreSQL task, runs the existing agent
  permissions/tools and saves results through the existing company runtime.
- Eight-minute task execution ceiling. The supervisor kills interrupted child
  execution before marking still-RUNNING work HOLD. It never automatically
  retries potentially completed side effects. Review the task before requeueing.
- Task output is stored privately in PostgreSQL, not public Actions logs. No
  database dump or customer-data artifacts are uploaded.
- If the entire runner is killed before cleanup (for example manual cancellation
  or infrastructure loss), a RUNNING task can remain. Review its events before
  manually moving it to HOLD/requeuing. There is deliberately no blind replay.
- The old five-minute CEO workflow is skipped only when both native activation
  flags are true. Other specialist schedules still need individual cutover review.

## Activation requirements — all are still required

1. Back up Render and preserve its records. Obtain both source and Supabase
   session-pooler connections privately. Reconcile the incompatible target schema
   without overwriting unrelated data, copy records and validate parity/sequences.
2. Deploy the native Netlify candidate with Supabase and Gemini runtime secrets.
   Test the exact revision: native hosting, DB reads/writes, auth, storefront,
   checkout/payment verification, approvals and persisted agent execution.
3. Add the following GitHub repository secrets (Settings -> Secrets and variables
   -> Actions -> Secrets): `SUPABASE_DB_URL`, `GEMINI_API_KEY`,
   `BHARATSHOP_AUTOMATION_TOKEN`. Do not copy SOURCE_DATABASE_URL into this worker.
4. Add repository variables: `BHARATSHOP_NATIVE_ORIGIN` (the accepted HTTPS
   netlify.app origin), `BHARATSHOP_NATIVE_REVISION` (its full 40-character commit),
   `GEMINI_MODEL` (model available to your Google project). Optional:
   `BHARATSHOP_NATIVE_SEARCH_URL` for hosted HTTPS search without Render.
5. Only after database and native deployment acceptance, set repository variables
   `BHARATSHOP_MIGRATION_VERIFIED=true` and
   `BHARATSHOP_NATIVE_WORKER_ENABLED=true`. These flags record operator acceptance;
   they do not perform or prove database migration by themselves.
6. Dispatch one worker and verify its persisted task, events, approval handling and
   Gemini usage before leaving the six-hour schedule enabled.

Local bundle-only check: `node scripts/run-native-company-worker.mjs --check`
with non-secret fixture settings, as exercised by the tests. This mode does not
contact a database, call Gemini, claim work or test live integration.

Standard GitHub-hosted runners are free for public repositories under GitHub's
Actions policy. This repository is public. Private repositories have plan-specific
allowances; Gemini and Supabase quotas remain separate and must be monitored.
See https://docs.github.com/en/billing/concepts/product-billing/github-actions .
No paid fallback model, larger runner or paid hosting upgrade was added.

## Current verification

134 regression tests pass, including runtime worker supervision tests, native
configuration checks, proxy/revision rejection and a build of the existing agent
runtime into the standalone worker. Typecheck, production build and lint pass
(lint retains 37 existing warnings). Live worker execution and native deployment
are blocked by source/target database access, migration and runtime credentials.

## Rollback

Set `BHARATSHOP_NATIVE_WORKER_ENABLED=false` to stop future worker jobs. Do not
cancel an executing task unless necessary; inspect its persisted result if
interrupted. This change does not modify the production app's database connection
or deploy configuration. Database cutover rollback still requires reconciling any
new writes before switching back to the source.
