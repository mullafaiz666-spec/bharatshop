# Netlify production redeploy — 2026-09-15

This marker intentionally triggers the existing `Deploy BharatShop Netlify Production` workflow from `main` after production was found serving an older September 12 revision.

No database cutover is authorized by this marker. `BHARATSHOP_MIGRATION_VERIFIED` and the native worker activation gate must remain false until source data is backed up, migrated, and parity-verified.
