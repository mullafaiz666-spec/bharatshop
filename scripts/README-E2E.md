# BharatShop E2E operational contract

The production loop is:
1. live research
2. source/product verification
3. marketing enrichment
4. publish only verified products
5. customer storefront
6. customer order -> RECHECK_REQUIRED
7. CEO authorization
8. operator/manual supplier purchase
9. supplier order + tracking

The storefront and dashboard must read the same `products` table. Automated catalog maintenance must never silently leave the customer catalogue empty; it may refresh/verify products but must not require a missing external URL to make the catalogue usable.

`BHARATSHOP_URL` is optional for local/manual catalog maintenance and required only for the scheduled HTTP maintenance workflow. If absent, the workflow should skip the remote call rather than fail the repository's operational checks.
