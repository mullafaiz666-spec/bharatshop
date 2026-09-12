# BharatShop completion report — 2026-09-12

Status: INCOMPLETE — tested safety fixes on existing PR #71; no production cutover.

| Area | Verified status |
|---|---|
| 1. Architecture | Existing Next.js 16 / React 19 frontend and API routes, Drizzle / pg PostgreSQL. Netlify production config proxies Render. Native candidate config exists separately. |
| 2. Git | Existing codex/netlify-free-stack-cutover branch / PR #71. Older dirty workspaces were preserved. |
| 3. Build | Production build passed locally after safety changes; no production DB required for build. |
| 4. Tests | 123 tests pass, including runtime tests for rejected synthetic seeding, missing operator, unauthorized cart access, revoked sessions, database outage and truthful campaign drafts. Typecheck passed. Lint has pre-existing warnings; no rules disabled. |
| 5. Database | Render identifies bharatshop-db, PostgreSQL 16, available. Query connector failed with connection EOF / SSL-required errors. Source schema, records and backup are not yet verified. Provider reports expiry September 26, 2026 at 23:20 UTC. |
| 6. Supabase | Read-only checks confirm products/orders/order_items/profiles each contain zero rows. UUID IDs remain incompatible with repository integer IDs. No schema or data changes made. |
| 7. Gemini | Server-side provider exists; local GEMINI_API_KEY absent. Live generation not verified. |
| 8. Agents | Existing persisted agent/task implementations and regression coverage retained. No claim that all 18 requested roles execute successfully in production. |
| 9. Product / Fashion Designer | Existing workflow retained; transaction and owner-scoping regression tests pass. Live approval, inventory and publishing acceptance remains pending. |
| 10. Storefront | Live homepage returned HTTP 200. Storefront product API timed out after 25 seconds from this environment. Full customer journey not verified. |
| 11. Command Centre | Signed sessions now also require persisted authorized administrator lookup. Revoked/demoted sessions fail closed. Company cart added to protected paths. Live authenticated dashboard remains unverified. |
| 12. Payments | Existing payment regression suite passes. No transaction, charge or webhook was sent; live payment verification remains pending. |
| 13. Meta | Existing integration retained. Live configuration/provider operations not verified. Campaign drafts no longer invent reach, ROAS, spend or delivery/COD promises. |
| 14. Google | Existing analytics, advertising and Gemini integrations retained. Live credentials and conversion events not verified. |
| 15. Security | Removed implicit sample user/order/product/activity inserts and synthetic bulk publication. Read-only migration verifier now rejects RLS-filtered visibility and inventories tables independently of SELECT privileges. Historical stored sample records were not deleted. This is not an exhaustive security certification. |
| 16. Deployment | Render and Netlify production configuration unchanged. No merge or deploy of this candidate. |
| 17. Production URL | https://bharatshop-9w4a.onrender.com |
| 18. Blockers | Source connection/access and backup, target session-pooler connection, final schema reconciliation and data copy, native runtime credentials, measured agent execution budgets, and live acceptance. These include engineering/verification gates, not only credentials. |
| 19. Rollback | No database or runtime changes to roll back in this session. Retain current Render connection/runtime. Revert candidate commit if needed. Before eventual cutover: take backup, pause writes, verify parity and sequences, preserve old config. After target accepts writes, reconcile new records before pointing back to source. |
| 20. Next production action | Securely obtain SOURCE_DATABASE_URL from existing Render PostgreSQL Connections panel, establish authorized TLS connectivity, inspect source and take backup before expiry. Do not switch to empty Supabase. |

## Priority queue

- P0 fixed in candidate: synthetic data creation on normal route access; synthetic stock/sales bulk publication; unprotected company cart; signed-but-revoked session acceptance at shared request boundary; partial visibility in migration comparison.
- P0 blocked: source backup and real schema discovery; destination schema reconciliation and data preservation; production API timeouts need live diagnosis.
- P1 fixed in candidate: random campaign performance and budget projections removed; neutral draft text avoids unsupported fulfillment claims.
- P1 pending: complete provider-backed acceptance, native function execution budgets and workflow scope, end-to-end customer and publishing verification, historical synthetic data provenance review without deleting records.
- P2 pending: existing React hook and image lint warnings, broader UI/accessibility review.

## Credential handling

Supply connection strings only through a private environment/ignored `.env.migration` file. Never through a public issue, PR or source file. Required first: SOURCE_DATABASE_URL (Render External Database URL, authorized network access). Next: SUPABASE_DB_URL (Supabase Connect -> Session pooler, with existing database password). Do not reset passwords to reveal them or open the source allowlist to everyone.

The migration comparison uses PostgreSQL's documented row_security=off behavior: error if policies would filter records, not policy bypass. See https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-ROW-SECURITY . Live database verification of this candidate still requires both connections.
