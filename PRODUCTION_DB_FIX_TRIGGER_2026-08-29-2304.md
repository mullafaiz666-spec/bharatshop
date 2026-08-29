# Production DB fix deployment trigger

The DB socket fix is already on `main` in commit `34d9acd5fc6cd6f890589bc37a7d75a6d58a562b`.
This commit intentionally triggers the connected Vercel production deployment so the fix can be verified against `/api/health` and `/api/storefront/products`.
