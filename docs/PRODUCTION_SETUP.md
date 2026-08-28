# BharatDrop production setup

The repository currently contains a working application shell, database-backed catalog/order tables, Shopify synchronization, and AI/demo catalog generation. The supplier names and seeded catalog are not proof of live supplier inventory or authorization.

## Required production credentials

Set these in Render environment variables (never commit secrets):

- `DATABASE_URL` — production PostgreSQL connection string
- `SHOPIFY_STORE_URL` and `SHOPIFY_ADMIN_TOKEN` — only if Shopify is used
- `CJ_API_KEY` — CJ Dropshipping API key for real supplier catalog/inventory
- `CJ_COUNTRY_CODE=IN`
- `CJ_FROM_COUNTRY_CODE=CN` (change if the selected supplier warehouse is elsewhere)
- `USD_INR_RATE` — current rate used for price calculation; update from a trusted FX source
- `DEFAULT_DROPSHIP_SHIPPING_INR` — verified shipping estimate for the selected supplier/warehouse
- `MIN_DROPSHIP_MARGIN_PCT=35`
- `CJ_LIVE_FULFILLMENT_ENABLED=false` until the supplier account, payment method, shipping methods, returns and tax rules are tested

## Supplier flow

1. `GET /api/suppliers/cj?q=<keyword>` checks the live CJ catalogue and returns supplier data.
2. `POST /api/suppliers/cj` with `{ "action":"IMPORT", "keyword":"...", "limit":20 }` imports only products returned by the supplier API with positive verified inventory and positive modeled margin.
3. Imported products are linked to the supplier in `supplier_product_links` so fulfillment can use a real supplier product ID rather than a fake store name.
4. `POST /api/suppliers/cj` with `{ "action":"CREATE_ORDER", ... }` is blocked unless `CJ_LIVE_FULFILLMENT_ENABLED=true`.

## Marketing

The existing campaign generator creates campaign records/copy. It must not be interpreted as proof that Google, Meta, Instagram or email ads were actually purchased or sent. Before enabling live ads, connect the corresponding advertising accounts and add explicit budget, audience, landing-page, tracking/consent and policy checks.

Recommended live controls:

- never exceed a configured daily spend cap
- start campaigns paused/draft for verification
- require valid product availability and margin before advertising
- use UTM/attribution IDs for every campaign
- stop campaigns when supplier inventory, price or margin becomes invalid

## Order fulfillment safety

Do not auto-submit a supplier order merely because a customer order exists. Verify payment status, address, product-to-supplier mapping, current supplier price/inventory, shipping availability to the destination, expected margin, tax treatment and refund/return policy. Only then enable live fulfillment.

## End-to-end test

1. Health: `GET /api/health`
2. Supplier health: `POST /api/suppliers/cj` `{ "action":"HEALTH" }`
3. Import one supplier product.
4. Verify its supplier link and inventory.
5. Verify storefront checkout creates an order with the correct SKU/product ID.
6. Keep live fulfillment disabled and run a test order against the supplier sandbox/test facility if the supplier account supports one.
7. Verify Shopify sync only if Shopify is configured.
8. Create a marketing campaign in draft/paused mode and verify tracking.
9. Only after all checks pass, enable live fulfillment and advertising independently.
