# BharatShop Coding Agent Rules

These rules apply to DeepSeek Harness and delegated coding agents working in this repository.

## Mission

Improve, test, repair, and operate the existing BharatShop system. Do not replace it with a disconnected demo.

## Hard safety rules

1. Never run destructive production database commands such as `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, destructive reseeds, `prisma migrate reset`, or `supabase db reset`.
2. Treat the existing production database as the source of truth until a guarded migration and parity verification explicitly approves cutover.
3. Never read, print, copy, commit, transmit, or expose `.env`, `.env.local`, credentials, API keys, tokens, passwords, database connection strings, payment secrets, signing material, or browser/session secrets.
4. Never force-push shared branches or rewrite production Git history.
5. Do not disable authentication, payment protections, approval gates, database safety checks, or agent safety checks merely to make tests pass.
6. Prefer additive and reversible changes. Inspect first, change the smallest coherent surface, and run the relevant checks.
7. Never claim that an integration, service, agent, database migration, payment route, or deployment is operational without verification evidence.
8. Do not mutate production data while diagnosing or testing unless the user explicitly authorizes that exact mutation.
9. External publishing, billing, irreversible account actions, production cutovers, and customer-impacting mutations must stop at the existing approval boundary.

## Working method

- Preserve working architecture and integrations unless the task explicitly requires replacement.
- Prefer free/local AI where practical, but do not silently downgrade to a model that cannot reliably perform the task.
- Run relevant typecheck, tests, build, and targeted verification after edits.
- Report files changed, checks run, failures or blockers, and the safest next action.
