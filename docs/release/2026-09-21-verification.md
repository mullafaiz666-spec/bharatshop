# BharatShop verification — 21 September 2026

Decision: **KEEP MODIFYING LOCALLY. Not ready for production.**

## Source and scope

Continues existing draft PR #114, `repair/reconcile-20260918`, revision
`30d266b55d207a6941f9c64e7aa3dca5b4c0a781`. The reconstructed candidate's Git tree
exactly matched GitHub tree `e48d9a5265d9f668f6089cef4ff4dcbe4ffd7efe` before edits.
The Windows checkout and its uncommitted changes were not accessible. No existing
checkout was overwritten. No production data, migrations, live payments, supplier
orders, ads, production deploys or main-branch changes were performed.

## Repairs

- Storefront order, core order and audit writes now share a database transaction.
  A later insert failure rolls back all earlier writes.
- Optional Idempotency-Key uses PostgreSQL transaction advisory locking and a
  deterministic opaque order reference. Identical retries retrieve the original
  order; reusing a key with different details returns 409. No schema migration.
- Both storefront checkout components retain per-request keys while mounted so
  payment/network retries do not create duplicate orders. Keys are not persisted
  across browser reloads. Multi-line checkout still creates individual orders,
  rather than an atomic whole-cart transaction; prior lines can remain pending if
  a later line fails. This remains a release limitation.
- Invalid JSON, delivery fields, product IDs, keys and unusable prices are rejected.
  Database error details are no longer returned from order creation.
- Closing Razorpay's modal unlocks checkout. BharatDrip clears retry keys after
  verified success so a subsequent intentional order can be created.
- Machine AI readiness uses a fast loopback-only identity endpoint, verifies the
  checkout root and serving PID, and no longer treats a saved live PID as proof
  of a healthy UI. Stop refuses an unverified process. This is UI readiness,
  not evidence of working Ollama inference or completed agent tasks.
- Preserved previous unmerged release fixes: cross-platform Node production
  launcher, loopback start:local, and an explicit acceptance-test target instead
  of defaulting a mutating acceptance suite to production.

## Verification

| Check | Result |
|---|---|
| Integration/regression suite | 286 passed, zero failed or skipped |
| TypeScript | Passed |
| Production Next.js build | Passed |
| ESLint | Zero errors; 60 existing warnings |
| Git whitespace check | Passed |
| HTTP page smoke | /, /women, /men, /kids, /electronics, /store, /bharatdrip returned 200 |
| Auth smoke | /dashboard redirected to /admin-login; /api/cart and /api/orders returned 401 |
| Machine UI identity | Correct service/root/PID returned; foreign Origin rejected with 403 |
| Stale PID regression | Real manager subprocess refused to stop unrelated test service |
| Database catalogue | Local /api/storefront/products returned 500; no DB configured here |
| Payments | Local status reports both providers unconfigured, productionReady=false |
| Overall health | Local /api/health returned 503 |

Order rollback and retry tests execute the real route with a transactional database
test double. They are not live PostgreSQL concurrency or payment-provider tests.
The build reused the candidate's matching dependency versions from a prior workspace;
a fresh network installation was unavailable. Windows-native process behavior and
startup registration were not verified.

## Live observations

- Browser inspection of https://bharatshops.netlify.app rendered the storefront,
  then displayed “Nothing here yet.” No live catalogue products were visible.
- The browser reported minified React error #418 (hydration). No diagnosis or
  production fix is claimed from this observation alone.
- Netlify's PR #114 deployment `6aae1ec56242cb0008e826f7` is in error state, matching
  the candidate revision. The dashboard identifies the Building stage as failed;
  detailed error text was not available through the inspected surfaces.
- The candidate still proxies database-backed APIs to the authoritative Render
  runtime. This was retained to protect the existing source of truth. Native
  Supabase cutover is not verified.

## Remaining release work

1. Reconcile this patch with the latest Windows working tree, preserving local
   changes. Verify the exact serving checkout, UI, Ollama, shim and supervisors.
2. Use an isolated PostgreSQL test database. Run real rollback, retry concurrency,
   customer/admin/seller and multi-item order scenarios.
3. Implement and verify inventory reservation, release on cancellation/expiry,
   and oversell prevention. Current stock checking alone is insufficient.
4. Verify Razorpay and Cashfree sandbox initiation, cancellation, failure, success,
   webhook replay/concurrency and post-payment fulfillment gates.
5. Restore/verify the authoritative live catalogue. Inspect migration and data
   parity before any Netlify/Supabase cutover; never replace production data.
6. Diagnose the Netlify build failure and hydration error, then verify an isolated
   preview, mobile/browser customer journey and console before promotion.
7. Verify supplier, Shopify, Meta/Google and fashion workflows against actual
   configured services without triggering spend or external publication.
8. Exercise genuine agent tasks and queue/restart recovery. Agent definitions,
   heartbeat files and HTTP 200 are not completion evidence.

No deployment is recommended until these gates have evidence. Keep this patch in
review; do not merge to main or promote it automatically.
