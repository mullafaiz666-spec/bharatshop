# BharatShop — Chain 1 & Chain 2 Fixes

## Chain 1: Image Pipeline

| Issue | Fix |
|---|---|
| No SearXNG integration | `src/lib/searxng.ts` — client that queries a SearXNG instance's `/search?categories=images&format=json` endpoint, with timeout + safe fallback (never throws) |
| No `productImages` table | Added to `src/db/schema.ts` — stores every resolved image with `sourceEngine` (`searxng` \| `unsplash_fallback`), search query, dimensions, source page URL |
| No image resolver | `src/lib/imageResolver.ts` — builds a query from brand+title, calls SearXNG, picks the first valid result, persists it, and falls back to the category-matched Unsplash pool (`pickFallbackImageForCategory` in `productEngine.ts`) if SearXNG returns nothing |
| No CEO DB counts | `src/app/api/admin/verify/route.ts` — live row counts for every table + image-pipeline breakdown (searxng vs fallback vs missing). `src/app/api/health/route.ts` also now returns a timestamp + real DB error on failure |

New endpoint: `POST /api/products/images` — `{ productId }` to resolve one product, or `{ all: true, limit }` to batch-resolve unresolved products (capped at 100/call to stay inside serverless time limits). `GET /api/products/images` returns pipeline stats.

**Configuration:** set `SEARXNG_URL` to your deployed SearXNG instance (already set on the live Render service to `https://bharatshop-searxng.onrender.com`). If unset or unreachable, every resolution silently falls back to the Unsplash pool — the pipeline never breaks the app.

## Chain 2: Deployment

| Issue | Fix |
|---|---|
| No `render.yaml` | Added at repo root — describes the web service, health check path, and env vars as code |
| No `Dockerfile` | Added — single-stage Node 20 Alpine build (keeps `drizzle-kit` available at runtime since schema sync now runs at start, not build) |
| No health check | `/api/health` already existed but wasn't wired as the service's health check path; `render.yaml` now sets `healthCheckPath: /api/health` |

**Important build change:** `package.json` — schema push moved from `build` to `start`:
```
"build": "next build"
"start": "drizzle-kit push --force && next start"
```
This guarantees the new `product_images` table (and any future schema change) is created on every deploy, using the runtime `DATABASE_URL` — which is always available at start time, unlike at Docker build time.

## Next steps to go live
1. Push this code to `github.com/mullafaiz666-spec/bharatshop` (the repo the live service deploys from).
2. The live service (`bharatshop-9w4a.onrender.com`) already has `SEARXNG_URL` set — no dashboard changes needed there.
3. Once pushed, either let auto-deploy (currently **off** on that service) pick it up manually, or ask me to trigger a deploy via Render.
4. Verify with `GET /api/admin/verify` and `GET /api/health` after deploy.
