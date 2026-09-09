# BharatShop build and integration review — 9 September 2026

## Observed failure

The reported failure is a production acceptance failure, not a TypeScript/Next build failure. GitHub Agent Suite Build run 34336229312 passed typecheck, production build and lint. Production Acceptance run 34336265614 failed gate 6 because there were no visible current-style BharatDrip model photos. Photo Studio run 34336265647 received `ZeroGPU generation error: null` for every attempt and produced zero photos. The strict image gate is retained.

The live `/api/health` response reported PostgreSQL ready and the local OpenAI-compatible Gemma endpoint reachable. This shallow check does not prove inference quality or multimodal capability. No production database changes were made during this review.

## Changes

- Remove automatic forced database pushes from legacy startup/schema scripts. Treat remote `.internal` hosts as remote in the schema-push guard.
- Commit the dependency lockfile and run `npm ci` plus integration regression tests in build CI.
- Verify Razorpay capture on the server before accepting checkout success. Check gateway amounts and INR against stored checkout totals.
- Authenticate raw webhooks with length-safe signature comparison. Classify Cashfree payment and refund events explicitly. Confirm successful Cashfree orders through the gateway API.
- Lock checkout rows during gateway creation; reuse existing gateway orders for retries. Apply storefront/core payment changes in one transaction. Ignore duplicate or stale events and prevent paid/refunded orders regressing.
- Keep the existing partial-COD policy: online confirmation amount plus the recorded balance payable on delivery.
- Protect campaign creation and connection checks with operator authentication. Do not mark campaigns scheduled/live just because credentials exist. Keep ad spending disabled.
- Add read-only live connection checks for Google Ads, Meta Ads, Facebook Page and Instagram Business. Report configured separately from verified. Correct advertising-agent readiness to use the existing local AI provider.
- Generate fashion-art URLs from a trusted public origin rather than the internal Render bind address.
- Preserve the newer second free image-provider fallback from main. Use documented Gradio positional endpoints, require completed image events, keep timeouts active through stream consumption, bound generation attempts and report unavailable image generation honestly.

## Verification and remaining work

| Area | Status | Evidence / remaining work |
|---|---|---|
| Local TypeScript and production build | VERIFIED | `npm run typecheck`, `npm run build` |
| Regression tests | VERIFIED | `npm run test:integrations`: 10 tests; provider/DB interfaces mocked, no live charges |
| Lint | VERIFIED with warnings | No errors; 23 pre-existing warnings |
| Live free marketing | VERIFIED | Existing production passes `node scripts/marketing-acceptance.mjs`: 96 catalog rows, sitemap, Google/Meta feeds, organic copy and product structured data |
| Render deployment of this patch | NOT TESTED | Requires merging/deploying this branch and checking exact revision |
| BharatDrip image generation | BROKEN in observed production | Free providers failed; corrected request handling must be exercised after deployment. Do not relax the photo gate to hide this failure |
| Razorpay / Cashfree credentials | NOT CONFIGURED in observed production | `/api/payments/status` reports both false |
| Real payment, refund and COD workflow | NOT TESTED | Needs sandbox credentials, provider webhook delivery, a test order and fulfilment verification |
| Ad account permissions and publishing | PARTIAL | Account probes implemented; live campaign publication and purchase conversion delivery are still outstanding |
| Complete project production acceptance | NOT COMPLETE | Image, payments and live advertising gates remain |

## Configuration required for the next verification

Set secrets through the hosting dashboard/environment controls, never commit them or paste them into source.

- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- Cashfree: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`; optional separate `CASHFREE_WEBHOOK_SECRET` only if it is the signing secret agreed with the provider. Default API version remains `2025-01-01`.
- Payments default to test/sandbox unless `PAYMENT_MODE=live`. Razorpay mode is ultimately determined by the supplied key pair. Use sandbox keys first.
- Public origin: `PUBLIC_APP_URL=https://bharatshop-9w4a.onrender.com`.
- Google Ads account check: `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`; optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. Default API version `v25`, override with `GOOGLE_ADS_API_VERSION`.
- Meta: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`. Facebook Page: `META_PAGE_ID`. Instagram Business: `META_INSTAGRAM_ACCOUNT_ID`. Default Graph version `v26.0`, override with `META_GRAPH_API_VERSION`.
- Existing measurement configuration: `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, and domain-verification values. These public IDs do not authorize campaign spending.

After configuration, an authenticated `POST /api/marketing/connections` performs read-only provider checks. It neither publishes campaigns nor spends money. Payments must pass sandbox captured-payment, tampered-signature, duplicate-webhook, refund and COD-balance checks before live activation.

Render MCP listed one workspace, **My Workspace**, but requires the user's explicit workspace selection before its service/deploy/log tools can be used. This is an access requirement from the connector, not a request to reauthorize code fixes.

## Provider references consulted

- [Razorpay Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps)
- [Cashfree payment webhooks](https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks)
- [Cashfree create order and UUID idempotency header](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order)
- [Google Ads REST search](https://developers.google.com/google-ads/api/rest/common/search)
- [Meta Ad Account reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account)
- [Gradio curl API guide](https://gradio.app/guides/querying-gradio-apps-with-curl)
