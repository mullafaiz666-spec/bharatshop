# Native Netlify migration — updated 2026-09-12

The existing BharatShop source and operating terms remain authoritative:
GitHub -> Netlify Next.js -> Supabase PostgreSQL/Storage -> hosted Gemini.
Pinokio/Gemma on owned hardware is optional; checkout and production must not
depend on a desktop. Paid advertising, purchases and money movement keep their
existing approval and signature checks. No paid hosting upgrade is part of this migration.

## Verified current state

- Netlify team `postmanjallad` is Free. Existing site: `75b5c168-6679-479d-b3a6-244e393fe1b0`.
- `netlify.toml` currently proxies all traffic to Render. A ready production Netlify
  deployment therefore does not prove the native app revision is executing.
- PR #71 has a ready native deploy preview and its Creative Engine CI passed at
  commit `ce1ead20b1637eb8e0f2183de5c558ddf5d1d2fe` before the database-migration
  hardening commits were added. Each newer commit must pass CI again before merge.
- Supabase `cxsoomzauxcfrskgtqds` is ACTIVE_HEALTHY. Direct inspection on 2026-09-12
  confirmed that `public` contains exactly four base tables: `order_items`, `orders`,
  `products`, and `profiles`. All four contain zero rows. Their current schema is not
  BharatShop production schema and they carry starter RLS policies. No public views,
  materialized views or sequences were observed in the object inventory used for this review.
- Supabase security advisors returned no security findings before migration. Performance
  advisors reported only informational items, including two unindexed foreign keys on
  `order_items`; those starter objects are not the production schema.
- Render database `dpg-da8ccgdg1s2s7390490g-a` (`bharatshop-db`) is the current source
  of truth. The Render database is available, but the connected Render read-only SQL
  action currently fails before query execution because the connector reaches the external
  endpoint without satisfying Render's SSL/TLS requirement. This is a tooling/connectivity
  blocker, not evidence that the database is unhealthy. Do not relax the database IP allow
  list to `0.0.0.0/0` merely to make the connector work.
- Render's `bharatshop` service remains live on an older successful revision because the
  free Render workspace has exhausted its build-pipeline minutes. Recent deploy attempts
  were cancelled before build. The migration therefore continues on Netlify rather than
  adding a paid Render upgrade.
- The copy verifier requires core tables, all source tables, matching column definitions and
  constraints, row counts and streamed content fingerprints. It is read-only and cannot
  authorize cutover by itself.

## Guarded database copy now included

The branch contains two database migration paths:

1. `npm run db:migration-preflight` / `scripts/database-migration-preflight.mjs`
   performs read-only source/target inspection. It requires the Render source to contain
   the BharatShop core tables and requires Supabase to still match exactly the four known
   empty starter tables. If the target changes or receives data, it refuses preparation.
2. `.github/workflows/database-migration.yml` is manual-only. `preflight` mode performs no
   writes. `apply` mode additionally requires the exact confirmation text
   `MIGRATE_RENDER_TO_SUPABASE`. It re-runs the guard immediately before writes, creates an
   ephemeral `pg_dump` of the source public schema/data, removes only the four verified empty
   starter tables, restores the source public schema/data in one restore transaction, enables
   RLS on migrated public tables, revokes direct `anon`/`authenticated` Data API privileges,
   and then runs the full parity verifier. The source dump is never uploaded as an artifact.
3. The workflow never switches production traffic, changes Render's database, or retires
   Render. A successful copy is still only a migration candidate until native acceptance passes.

The workflow expects private GitHub Actions secrets named `SOURCE_DATABASE_URL` and
`SUPABASE_DB_URL`. These values must be obtained from the authorized Render and Supabase
connection panels and must never be committed, pasted into issues, or printed in logs.

## Final migration and cutover sequence

1. Obtain the authorized Render external PostgreSQL connection string and a Supabase pooler
   or direct PostgreSQL connection suitable for migration. Keep both private.
2. Run the workflow in `preflight` mode. It must prove the Render source has the BharatShop
   core tables and the Supabase target is still the exact empty starter schema.
3. Back up the Render source using Render's supported backup/export path before any target
   replacement. Do not delete, reset, or modify the Render source.
4. For the final copy window, stop or otherwise block new production writes so orders cannot
   change between dump and verification. Do not claim zero-downtime migration without a real
   write-freeze/delta-capture mechanism.
5. Run the workflow in `apply` mode with the exact confirmation text. It copies only the
   source `public` schema/data to Supabase and verifies table/schema/content parity.
6. Independently verify sequences, Supabase RLS/Data API exposure, storage objects, sessions,
   admin login, catalog, checkout, Razorpay/Cashfree signature verification, order persistence,
   private downloads, agent queue execution and approval gates.
7. Configure the native Netlify deploy-preview environment with the verified Supabase
   connection, hosted Gemini key/model, admin/automation secrets, payment webhook secrets and
   private storage credentials. Keep every server secret out of `NEXT_PUBLIC_*` variables.
8. Deploy using `netlify.native.toml`, validate the exact revision and confirm
   `hosting.netlify=true`. The candidate must not depend on Render or a desktop model.
9. Only after acceptance and explicit cutover approval, promote the native configuration to
   production, update callbacks/schedulers, and repeat production acceptance. Preserve a
   rollback path and do not retire Render until the native system is stable.

## Free-plan constraints

Netlify Free includes finite monthly usage and one concurrent build. Usage includes production
deploys, compute, requests and bandwidth. Free does not mean unlimited; services may pause at
quota. Keep paid auto-recharge/upgrades disabled unless explicitly approved.

Supabase Free also has finite database/storage/egress limits and idle-project behavior. Do not
add artificial keep-alive traffic merely to avoid plan limits.

Netlify synchronous functions have bounded execution time. Long-running company-agent work is
therefore executed through the existing queue/worker design rather than pretending a request
completed when it only enqueued work.

Gemini free-tier availability and data-use terms depend on the selected Google project/model.
Keep customer/payment secrets out of model prompts. PixVerse remains an optional credit-backed
creative worker behind explicit enable/spend gates and is not a core production dependency.
