# BharatShop release verification — 21 September 2026

Decision: **KEEP MODIFYING LOCALLY. Not ready for production promotion.**

## Source and safety scope

This verification continues draft PR #115 on branch
`fix/end-to-end-readiness-20260921`. The PR was verified open, draft and unmerged.
Its starting head for this continuation was
`ba09d27165ceb9da2ae173ce78d7e47c3011dc90`.

The Windows checkout at `C:\Users\faizm\bharatshop-harness` is not reachable from
this cloud execution environment, so its exact working-tree status cannot be asserted
here. No reset, clean, checkout replacement or destructive reconciliation was
performed. Existing PR fixes for checkout retry/idempotency, transactional order
creation, Razorpay cancellation/dismiss recovery, and Machine AI startup identity
verification were preserved.

No production database write, reset, seed, migration or cutover was performed. No
production or sandbox payment was created. No deploy or PR merge was performed. No
supplier order, Shopify publication, product publication, advertising publication or
spend was triggered. No credentials are recorded in this document or committed by
this work.

## Optional Perplexity research provider

Perplexity was added only to the existing explicit public web-research tool path.
It does not replace the local Ollama/`qwen3.5:4b` default, the existing AI provider
chain/Gemini fallback, or the audit/evidence architecture.

Implementation:

- `src/lib/ai/perplexity-research.ts` is server-only and uses the existing Fetch
  runtime; no new paid SDK/dependency was added.
- The key is read only from `PERPLEXITY_API_KEY`. The example environment file
  contains an empty placeholder only.
- When the key is absent, readiness reports `NOT_CONFIGURED` and research continues
  through the existing SearXNG path.
- Configured readiness is reported as `CONFIGURED_UNVERIFIED`; health responses do
  not return the key.
- Perplexity is consulted only by `research_web`, which the agent runtime already
  reserves for current/latest/trend/market/competitor/supplier/research-style tasks.
  General agent reasoning still uses the existing model provider.
- Results normalize public source URLs, titles, snippets, timestamps, citations and
  SHA-256 evidence hashes.
- Private/local URLs and hosts, database URLs, URL credentials, credential/token
  material, customer email/phone fields, card/PAN-like data, BharatShop order refs,
  payment identifiers and named secret variables are blocked before an external
  request or external-search fallback.
- Requests have a bounded timeout, one bounded retry for transient/rate-limit
  conditions, caller cancellation, Retry-After handling and sanitized errors.
  Malformed successful responses are rejected rather than converted into invented
  evidence.

Focused Perplexity tests cover configured, unconfigured, timeout, rate limit,
malformed response, privacy filtering, provider fallback and caller cancellation.

## Inventory reservation and cancellation

The previous checkout only compared `stockCount` before inserting an order, so two
concurrent checkouts could oversell. The PR now performs a conditional decrement
inside the existing order transaction:

`UPDATE products SET stock_count = stock_count - quantity ... WHERE stock_count >= quantity RETURNING stock_count`

No schema migration is required. If any later storefront/core/audit write fails, the
transaction rolls the stock change back. An idempotent checkout retry finds the
existing order before reservation and does not decrement stock twice.

A cancellation endpoint now requires the same opaque checkout idempotency key,
locks the order, and can release a held reservation exactly once. Multi-line
BharatShop and BharatDrip checkout preparation rolls back earlier prepared lines if
a later line fails before gateway initiation. Cancelled checkout keys cannot be
reused as live orders.

Safety limitation: after a Razorpay/Cashfree gateway order has been created,
inventory is deliberately **not** released by the public cancellation endpoint
without verified gateway state. Automatic expiry/release of abandoned gateway
sessions is therefore still a release blocker rather than risking stock being sold
twice after a late payment.

## Database connectivity and parity

### Current Render source

Render control-plane evidence reports `bharatshop-db` available on PostgreSQL 16.
The free database metadata reports an expiry timestamp of
`2026-09-26T23:20:33.577398Z`, which is an operational release risk.

A read-only SQL parity query was attempted through Render's read-only database tool.
It failed before executing the SELECT with `FATAL: SSL/TLS required (SQLSTATE 28000)`.
No database statement was applied and no source row counts were obtained through
that connector.

The application DB client itself still explicitly enables TLS for non-local
PostgreSQL URLs in `src/db/index.ts`; the connector failure does not prove that the
application connection is broken, but it prevents independent source parity proof
from this session.

### Supabase target

The connected Supabase project is `ACTIVE_HEALTHY` on PostgreSQL 17. Read-only
schema inspection shows:

| Table | Rows |
|---|---:|
| `public.products` | 0 |
| `public.orders` | 0 |
| `public.order_items` | 0 |
| `public.profiles` | 0 |

The target schema is also materially incompatible with the current BharatShop
Drizzle schema: for example, Supabase uses UUID product/order identities and a
different order model, while current BharatShop uses serial/integer product/order
identities plus `storefront_orders` and broader operational/agent tables.

**Database cutover is blocked.** No migration, copy, seed, reset or write was
performed on Supabase or Render.

## Razorpay and Cashfree

Source-level payment protections remain intact: server-side credentials, order row
locking, amount/currency verification, signature verification, payment transition
guards, replay handling and post-verification fulfilment gating.

The current Netlify project configuration was inspected without displaying values.
The required Razorpay/Cashfree credential variables and payment-mode variables are
not configured there, including Razorpay key/secret/webhook and Cashfree
client/secret/webhook settings. Therefore a real sandbox initiation/cancel/fail/pay
cycle cannot be truthfully verified from the Netlify runtime yet.

No payment API call and no production payment was performed.

Sanitized Netlify configuration inspection also shows no native
`DATABASE_URL`/`SUPABASE_DB_URL`, SearXNG, Perplexity, Gemini key, automation
token, CJ key or supplier mutation flags. That is consistent with the current
proxy/transition architecture, but it confirms Netlify is not ready for a native
backend cutover.

## Laptop Machine AI

The PR preserves the Machine AI serving-checkout/PID/identity startup repairs.
Focused code regression tests pass. This session cannot execute the user's Windows
machine at `C:\Users\faizm\bharatshop-harness`, so live evidence for Ollama
`qwen3.5:4b` generation, the UI on port 3001, supervisors, shim and a completed
agent task remains **NOT VERIFIED**.

A passing CI test is not being treated as proof that the laptop runtime is currently
healthy.

## Storefront product loading and hydration

The current branch builds successfully. Browser-only localStorage usage in the
inspected storefront/cart source is effect-gated, so no new hydration diagnosis is
claimed from static inspection.

The previous customer catalogue fetch converted an upstream catalogue failure into
an empty product list, which could render the same customer-visible "Nothing here
yet" state as a genuinely empty catalogue. This PR now keeps an explicit
`catalogueError` state, rejects malformed catalogue responses and shows a
"Catalogue temporarily unavailable" message instead of falsely presenting a
transport/runtime failure as zero inventory.

The Netlify catalogue endpoint is intentionally proxied to the authoritative Render
`/api/storefront/products` until database parity is proven.

A previous release investigation observed a hydration error and an empty catalogue.
The public Netlify and Render URLs could not be reached through this session's web
or container DNS paths, so that browser symptom was not independently reproduced
here. Render control-plane app logs on 21 September show repeated successful Next.js
startup ("Ready"), but no request-log entries for the inspected window. Live
storefront loading/hydration therefore remains a runtime gate.

## Netlify build and runtime

Netlify project `bharatshop-35fd` exists and its current production deploy is
reported `ready`. However that production deploy is stale relative to PR #115:

- deploy ID: `6aa52ee7ff58fc0008915e6d`
- deployed branch: `main`
- deployed commit: `0e3b45ee09e970428ebe63bda08c92a4d7df56a1`
- published: 12 September 2026
- PR #115 candidate is a later, different revision

The deployed runtime includes the Next.js server handler, company scheduler and
storefront-products proxy. Netlify's secret scan for that deploy reported no
matches.

No new Netlify deploy was triggered. A green PR build proves the candidate compiles;
it does not prove the stale production runtime has the candidate fixes.

## Supplier and agent E2E

A supplier safety review found the CJ POST route previously allowed mutation actions
without backend authorization and the CJ import path inserted products directly as
`Published`. This PR now:

- requires backend automation/admin authorization for mutation actions;
- keeps `CJ_PRODUCT_IMPORT_ENABLED=false` by default;
- keeps `CJ_LIVE_FULFILLMENT_ENABLED=false` by default;
- adds a bounded `DRY_RUN` supplier discovery action that does not write catalogue
  data or create supplier orders;
- stages CJ imports as `STAGED` instead of auto-publishing them;
- adds integration tests proving unauthorized mutation is blocked, disabled import
  and fulfilment gates return blocked status, dry-run is non-mutating, and imported
  records are staged.

The connected Netlify project currently has no CJ API key, supplier mutation flags
or automation token configured, so a genuine external supplier dry-run cannot be
verified there yet. The integration suite exercises agent/runtime contracts and the
supplier safety boundary, but a genuine laptop-agent + supplier E2E run was not
performed because database parity, payment sandbox configuration, laptop Machine AI
execution and current Netlify runtime are not yet verified.

Triggering supplier purchases/publication merely to obtain a green test would violate
the release safety constraints. Supplier/agent E2E therefore remains
**BLOCKED / NOT VERIFIED**, not passed.

## Verification gates

GitHub Release Verification run #8 on PR #115 completed successfully for code head `7a02e4f2076cf68fc2266fdeb0ff28850a60b61d`.

| Gate | Result |
|---|---|
| Focused checkout/inventory/payments/Machine AI/Perplexity | **PASS — 38/38, 0 failed, 0 skipped** |
| `npm run test:integrations` | **PASS — 302/302, 0 failed, 0 skipped** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors, 60 warnings** |
| `npm run build` | **PASS — optimized production build compiled successfully** |
| Creative Engine CI | **PASS** |

The 60 lint findings are warnings, including existing image-optimization and
React-effect warnings; lint exited successfully. They are not being silently
reclassified as errors.

## Remaining release blockers

1. Reconcile/verify the exact Windows working tree without discarding local changes,
   then run the laptop Machine AI/Ollama/shim/supervisor/task execution gate.
2. Restore read-only access to the authoritative Render PostgreSQL source and obtain
   schema plus row-count/parity evidence. Address the reported free-database expiry
   risk without destructive replacement.
3. Design and execute a guarded real-data migration/parity plan only after source
   evidence is available. Supabase is currently empty and incompatible; do not cut
   over.
4. Configure **sandbox/test** Razorpay and Cashfree credentials in the intended
   non-production runtime and verify initiation, cancellation, failure, success,
   webhooks, replay/concurrency and fulfilment transitions.
5. Add a verified expiry/release path for abandoned gateway-backed inventory
   reservations, or otherwise prove the operational cancellation policy cannot
   strand stock.
6. Verify the current PR on an isolated Netlify preview/runtime without promoting
   production. Confirm `/api/health`, catalogue loading, the new catalogue-error
   state, customer checkout and browser console/hydration behavior.
7. Configure only the non-mutating/sandbox supplier prerequisites needed for a
   genuine CJ `DRY_RUN` and laptop-agent task. Keep import and live fulfilment flags
   disabled until separately approved.
8. Only after the above, run non-destructive supplier/agent E2E through the
   approval-gated path. Do not place supplier orders, publish products/ads or spend
   money as a release test.
9. Re-run the complete release-verification workflow after any blocker fix. Merge or
   deploy only after both code gates and external runtime gates have evidence.

The candidate is materially safer and all requested repository gates pass, but the
external runtime/data/payment gates above prevent a production release decision.
