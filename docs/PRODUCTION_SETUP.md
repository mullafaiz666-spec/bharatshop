# BharatDrop production setup

The repository contains a Next.js application shell, PostgreSQL-backed catalog/order tables, supplier integrations, marketing workflow records, and a PWA shell. Seeded/demo records are not proof of live supplier inventory, live orders, live advertising, or authorization.

## Required production credentials

Set these only in Render environment variables; never commit secrets:

- `DATABASE_URL` — production PostgreSQL connection string
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

## End-to-end test

1. `GET /api/health` — database health.
2. Create a storefront test order using `RAZORPAY` in Razorpay test mode.
3. Create its Razorpay order server-side.
4. Complete/fail the test payment and confirm webhook status changes.
5. Confirm an invalid webhook signature is rejected.
6. Verify the supplier product link and live inventory before fulfillment.
7. Keep live supplier fulfillment disabled until the full test passes.
8. Keep advertising draft/paused until attribution and budget controls are verified.
