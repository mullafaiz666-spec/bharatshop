# BharatShop Native Netlify + Supabase Cutover Runbook

This runbook keeps the current Render production service available as rollback until the Supabase database copy and the native Netlify deployment are both verified.

## Non-negotiable safety rules

- Never reset, drop, truncate, destructively reseed, or replace the Render production database during migration.
- Never commit credentials or connection strings to GitHub.
- Keep `netlify.toml` in Render-mirror mode until every cutover gate below passes.
- Keep `BHARATSHOP_NATIVE_WORKER_ENABLED=false` until database parity is verified.
- Native Netlify production must have `BHARATSHOP_MIGRATION_VERIFIED=true`; the build guard blocks production otherwise.
- PixVerse stays optional and disabled unless credit-backed use is explicitly approved.

## Phase 1 — Safe configuration

Public/non-secret Netlify settings may be configured in advance. Private values must be stored only in provider secret stores.

Required migration secrets in GitHub Actions:

- `SOURCE_DATABASE_URL` — Render external PostgreSQL URL.
- `SUPABASE_DB_URL` — Supabase PostgreSQL connection suitable for the migration workflow.

Required native Netlify private runtime inputs before native production:

- `DATABASE_URL` or `SUPABASE_DB_URL` pointing to Supabase.
- `ADMIN_SESSION_SECRET` (32+ chars).
- `BHARATSHOP_AUTOMATION_TOKEN` (or legacy `AUTOMATION_TOKEN`).
- `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`).
- `SUPABASE_SERVICE_ROLE_KEY`.
- `RAZORPAY_KEY_ID`.
- `RAZORPAY_KEY_SECRET`.
- `RAZORPAY_WEBHOOK_SECRET`.
- `CASHFREE_APP_ID` / `CASHFREE_CLIENT_ID`.
- `CASHFREE_SECRET_KEY` / `CASHFREE_CLIENT_SECRET`.
- Payment webhook secrets required by the active Cashfree integration.
- Meta server-side tokens only when those integrations are enabled.

Never paste secret values into issues, PRs, logs, documentation, or chat transcripts.

## Phase 2 — Read-only database preflight

After `SOURCE_DATABASE_URL` and `SUPABASE_DB_URL` exist in GitHub Actions:

1. Run the **Guarded database migration** workflow in preflight/read-only mode.
2. Confirm both databases are reachable over TLS.
3. Confirm the source contains the expected BharatShop production schema.
4. Confirm the target is still the known starter Supabase schema and is safe for the guarded replacement path.
5. Stop immediately if source identity, target identity, schema expectations, or safety checks do not match.

No cutover and no production DB write is allowed in this phase.

## Phase 3 — Guarded copy and parity verification

Only after a controlled copy window is ready:

1. Take the workflow-managed source and target backups/dumps.
2. Copy the Render schema and data into Supabase through the guarded migration workflow.
3. Run `npm run db:verify-supabase` / `scripts/verify-supabase-copy.mjs`.
4. Require table and row-count parity and all verifier checks to pass.
5. If anything fails, restore the target backup and keep Render authoritative.
6. Only after verification succeeds, set `BHARATSHOP_MIGRATION_VERIFIED=true` in the native Netlify production environment.

Render remains rollback during and after this phase.

## Phase 4 — Native Netlify acceptance

Use `netlify.native.toml`; do not replace the mirror config first.

Validate:

- Storefront/catalog pages.
- Admin login/session behavior.
- PostgreSQL-backed APIs.
- Customer/private API authorization.
- Digital-download signing and Supabase Storage access.
- CEO/company agent dashboards.
- Queue/scheduled automation behavior.
- Gemini-backed AI calls and failure handling.
- Fashion/Creative Studio flows.
- Razorpay signature and webhook verification.
- Cashfree signature and webhook verification.
- Meta readiness only when credentials are actually configured.
- No Render or localhost dependency in native production configuration.

The native environment guard must pass, and production native deployment is blocked unless database migration verification is explicitly true.

## Phase 5 — Production cutover

Only after native acceptance passes:

1. Promote the verified native configuration.
2. Remove the catch-all Render proxy from the active production Netlify config.
3. Keep Render available as rollback until the native site is stable.
4. Enable `BHARATSHOP_NATIVE_WORKER_ENABLED=true` only after the verified Supabase database is the active source of truth and the automation acceptance checks pass.
5. Do not delete the Render database as part of cutover.

## Current gate

The project can continue in safe mirror mode without migration secrets. Actual database migration cannot begin until the two GitHub Actions database URLs are added privately. No workaround should expose or fabricate those credentials.
