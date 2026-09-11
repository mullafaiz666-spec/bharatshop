# Native Netlify migration — 2026-09-11

The existing BharatShop source and operating terms remain authoritative:
GitHub -> Netlify Next.js -> Supabase PostgreSQL/Storage -> hosted Gemini.
Pinokio/Gemma on owned hardware is optional; checkout and production must not
depend on a desktop. Paid advertising, purchases and money movement keep their
existing approval and signature checks. No paid hosting upgrade is part of this migration.

## Verified current state

- Netlify team `postmanjallad` is Free. Existing site: `75b5c168-6679-479d-b3a6-244e393fe1b0`.
- `netlify.toml` currently proxies all traffic to Render. A ready Netlify deployment
  therefore does not prove the new app revision is executing.
- Netlify has an admin-session secret, but database, Gemini, automation,
  payment and private storage credentials are absent.
- Supabase `cxsoomzauxcfrskgtqds` is healthy and about 10 MB. Its public
  products/orders/order_items/profiles tables are empty. UUID product IDs and
  different columns are incompatible with the production app's integer IDs.
  Do not overwrite these tables or treat them as a verified production copy.
- Render database `dpg-da8ccgdg1s2s7390490g-a` is the current source. Its
  external network allowlist is restricted; connected read-only queries failed.
  Obtain authorized connection access before copying. Do not open it to all IPs.
- The previous verifier only compared selected row counts and could pass an
  empty source. It now requires core tables, all source tables, matching column
  definitions/constraints, row counts and streamed content fingerprints.

## Prepare the candidate

1. Place the existing source and target connection strings in the ignored
   `.env.migration` file as `SOURCE_DATABASE_URL` and `SUPABASE_DB_URL`.
   Do not paste secrets into logs, issues or pull requests. Do not reset passwords
   merely to reveal them.
2. Back up the source. Review both schemas and preserve the unrelated target
   schema. Prepare a non-destructive copy, including all tables, constraints,
   indexes, sequences, private media and required extensions.
3. Run `node --env-file=.env.migration scripts/verify-supabase-copy.mjs`.
   The script uses read-only repeatable-read transactions. It never transfers
   records or authorizes cutover. Sequence positions, RLS, storage objects and
   sessions still require independent checks. Source writes must be paused for
   the final copy and comparison so new orders cannot be lost.
4. Configure the existing site's deploy-preview environment with verified
   Supabase connection, hosted Gemini key/model, admin/automation secrets,
   existing payment credentials/webhook secrets and private storage key.
   Required build-check inputs need builds and functions scopes and must remain
   server-only. Use the appropriate candidate origin for preview callbacks.
5. Use `netlify deploy --build --config netlify.native.toml --context deploy-preview`.
   This candidate has no Render proxy. Its preflight blocks missing required
   inputs and old Render/desktop dependencies before consuming a full build.
   The existing production configuration is unchanged until acceptance passes.
6. Validate exact revision and `hosting.netlify=true`, real catalog parity,
   login/session persistence, private APIs, AI tool execution, payment diagnostics
   without charging, private downloads, and bounded queue processing.
7. After copy verification and final cutover approval, promote the native
   configuration to `netlify.toml`, publish the validated revision to the existing
   site, switch approved callbacks/schedulers, and repeat production acceptance.
   Keep a rollback copy and do not retire Render before all checks pass.

## Free-plan constraints

Netlify Free includes 300 credits/month and one concurrent build. Usage includes
production deploys, compute, requests and bandwidth. Free does not mean unlimited;
services may pause at quota. Keep paid auto-recharge/upgrades disabled.
Supabase Free includes 500 MB database, 1 GB storage and 5 GB egress; idle projects
can pause after one week. Do not add artificial keep-alive traffic.

Netlify synchronous functions have a 60-second limit. Existing multi-minute
agent handlers and the five-minute GitHub workflow must be adapted and measured
before redirecting automation to native Netlify. The daily scheduler only queues
work; it is not proof of completed agent tasks. Search remains optional evidence
infrastructure and must report missing/throttled service honestly.

Gemini free-tier availability and data-use terms depend on the chosen model and
project. Verify eligibility before enabling it; keep customer/payment secrets out
of model prompts. No billable fallback or Netlify AI Gateway is enabled by this change.

Sources checked 2026-09-11:
- https://www.netlify.com/pricing/
- https://docs.netlify.com/build/functions/configuration/
- https://supabase.com/pricing
