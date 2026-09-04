# BharatDrop production setup

The repository contains a Next.js application shell, PostgreSQL-backed catalog/order tables, supplier integrations, marketing workflow records, and a PWA shell. Seeded/demo records are not proof of live supplier inventory, live orders, live advertising, or authorization.

## Required production credentials

Set these only in Render environment variables; never commit secrets:

- `DATABASE_URL` — production PostgreSQL connection string
- `OPENAI_API_KEY` — production OpenAI API key used by the AI CEO
- `OPENAI_MODEL` — optional; defaults to `gpt-5.6-luna`
- `ANTHROPIC_API_KEY` — production Anthropic API key used by exact-product image verification
- `ANTHROPIC_VISION_MODEL` — optional; defaults to `claude-sonnet-5`
- `RAZORPAY_KEY_ID` — Razorpay public key ID
- `RAZORPAY_KEY_SECRET` — Razorpay server secret
- `RAZORPAY_WEBHOOK_SECRET` — exact secret configured in Razorpay Webhooks
- `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` — if Cashfree is used
- `SHOPIFY_STORE_URL` / `SHOPIFY_ADMIN_TOKEN` — only if Shopify is used
- `CJ_API_KEY` — only for a configured CJ Dropshipping supplier account
- `CJ_COUNTRY_CODE=IN`
- `CJ_FROM_COUNTRY_CODE=CN` (change if the selected supplier warehouse differs)
- `USD_INR_RATE` — current trusted FX rate if the supplier flow requires USD conversion
- `DEFAULT_DROPSHIP_SHIPPING_INR` — verified shipping estimate
- `MIN_DROPSHIP_MARGIN_PCT=35`
- `CJ_LIVE_FULFILLMENT_ENABLED=false` until supplier account, payment method, shipping, returns and tax rules are tested

Never put any of these secret values in GitHub, `render.yaml`, client-side code, logs, or chat messages.

## Admin authentication

The private administrator console uses a PostgreSQL-backed admin account plus a signed, HTTP-only session cookie. The following **must** be configured in the Render production service:

- `ADMIN_EMAIL` — the exact administrator email, for example `mullafaiz666@gmail.com`
- `ADMIN_PASSWORD` — the administrator password; minimum 12 characters
- `ADMIN_SESSION_SECRET` — a random secret of at least 32 characters used to sign the admin session cookie

Do not commit these values. On the first successful login with the configured credentials, BharatShop creates or repairs the matching `users` row as role `Admin`, so a missing/stale database user no longer causes a false "Invalid administrator credentials" failure. The configured email is the only email accepted by this bootstrap path.

After changing any of these variables, redeploy/restart the Render service. Existing admin sessions should be treated as invalid after the session-signing change.

## AI provider readiness

`GET /api/health` now reports only non-secret readiness booleans for `openai` and `anthropic`, plus the selected model names. It never returns the secret values.

The production acceptance runner treats both providers being configured as a hard gate. A successful HTTP response alone is not sufficient.

## Render configuration

In the Render production service, open **Environment → Environment Variables** and add the required runtime credentials above. Save with a deploy/redeploy so the running service receives the values. Do not use GitHub Actions secrets as a substitute for runtime environment variables.

## Image verification

The image resolver follows:

`PostgreSQL cache → SearXNG candidate search → reachable image download → Claude vision verification → persisted AI_VISION_VERIFIED image`

Only images that pass the configured confidence threshold are written to the product image records. A missing Anthropic key causes the resolver to fail truthfully rather than saving unverified images.

## CEO execution chain

The CEO path must prove:

`CEO → Agent → Tool → Tool Result → Evidence → Audit → Decision → Approval → Action → Verified Result → Natural Response`

Tool execution records are persisted as evidence before the audit record references that evidence. Consequential actions must not bypass human approval.

## Razorpay checkout flow

1. Storefront creates an order through `POST /api/storefront/orders` with `paymentMode: "RAZORPAY"`.
2. Server creates the Razorpay order through `POST /api/payments/razorpay/order` using the server secret.
3. The browser uses the returned `keyId`, `razorpayOrderId`, amount and currency to open Razorpay Checkout.
4. Razorpay sends events to `POST /api/payments/razorpay/webhook`.
5. The webhook verifies `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET` before changing the stored payment status.
6. The client must never be allowed to mark an order `PAID` directly.

Webhook URL after deployment:

`https://<your-production-host>/api/payments/razorpay/webhook`

For the current Render host, this will be:

`https://bharatshop-9w4a.onrender.com/api/payments/razorpay/webhook`

Configure the URL in Razorpay only after the Render deployment containing the webhook code is live.

## Supplier flow

1. `GET /api/suppliers/cj?q=<keyword>` checks the live CJ catalogue and returns supplier data.
2. `POST /api/suppliers/cj` with `{ "action":"IMPORT", "keyword":"...", "limit":20 }` imports only products returned by the supplier API with positive verified inventory and positive modeled margin.
3. Imported products are linked to the supplier so fulfillment can use a real supplier product ID rather than a demo supplier name.
4. Supplier auto-ordering remains blocked unless the relevant live fulfillment flag is explicitly enabled.

## Marketing

Campaign records/copy are not proof that Google, Meta, Instagram or email ads were actually purchased or sent. Before live advertising, connect the corresponding accounts and enforce budget, audience, landing-page, tracking/consent, inventory and policy checks. Start campaigns paused/draft.

## Fulfillment safety

Do not auto-submit a supplier order merely because a customer order exists. Verify payment status, address, product-to-supplier mapping, current supplier price/inventory, destination shipping availability, expected margin, tax treatment and refund/return policy first.

## End-to-end acceptance

Run `node scripts/production-acceptance.mjs` against the production hostname. The runner now requires provider readiness, executes the image resolver by default, re-reads storefront images after resolution, requires an actual CEO tool call and persisted evidence/audit, requires a natural AI response, and keeps `Action → Verified Result` as a hard gate rather than simulating a destructive production action.

1. `GET /api/health` — Render, PostgreSQL and provider readiness.
2. `GET /api/storefront/products` — PostgreSQL-backed products.
3. Run image resolution with a valid automation token.
4. Re-read products and require real HTTPS verified images.
5. Call `/api/ceo-chat` and require an actual AI response.
6. Require a real agent-scoped tool invocation and returned result.
7. Require persisted evidence and an audit record referencing it.
8. Require a persisted CEO decision.
9. Verify approval handling for consequential actions.
10. Execute only a real, approval-aware action appropriate for the acceptance environment.
11. Re-read the changed state and persist the verified result.
12. Return the CEO's natural response based on the verified result.
13. Mark PASS only when every gate is green.
