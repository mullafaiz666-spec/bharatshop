# BharatShop AI Fashion Designer

BharatShop now has an autonomous fashion-designer endpoint and a daily GitHub Actions job.

## Daily loop

1. Gemini 3.1 Flash-Lite researches current Indian fashion demand with Google Search grounding.
2. The designer creates 10-25 original product concepts and scores trend fit, viral velocity and target price.
3. Gemini 3.1 Flash Image (Nano Banana 2) creates a production-ready hero visual for every accepted concept.
4. BharatShop creates an `AI_DRAFT` product and stores the generated visual in `product_images`.
5. If Qikink Open API credentials and the configured product-create endpoint are present, the agent can create the supplier-side product when `QIKINK_AUTO_CREATE_PRODUCTS=true`.
6. Performance data remains in the catalogue and can be fed back into future design decisions.

## Endpoint

`POST /api/fashion-designer` with `{ "count": 10 }` through `{ "count": 25 }`.

`GET /api/fashion-designer` reports provider and automation status.

## Environment

Required in Render:

- `GEMINI_API_KEY` — Google AI API key.
- `BHARATSHOP_AUTOMATION_TOKEN` — existing automation gateway token.

Optional:

- `GEMINI_TEXT_MODEL=gemini-3.1-flash-lite`
- `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`
- `GEMINI_IMAGE_SIZE=1K`
- `QIKINK_PRODUCT_CREATE_URL` — the exact Open API product-creation endpoint supplied by Qikink for the account.
- `QIKINK_API_KEY` — Qikink Open API credential.
- `QIKINK_AUTO_CREATE_PRODUCTS=true` — fail-closed switch for supplier product creation.
- `QIKINK_DEFAULT_PRODUCT_COST_INR=265`
- `QIKINK_DEFAULT_SHIPPING_INR=54`
- `MIN_AI_PRODUCT_MARGIN_PCT=35`

The Qikink endpoint is intentionally configuration-driven. Qikink documents Open API support for custom websites, but the public help pages do not expose a stable product-creation URL/schema; do not guess an endpoint or commit supplier credentials.

## Creative ads / UGC

Google Flow is the creative UI, while programmatic automation should use the underlying Google media APIs. Google currently exposes Gemini image generation and Veo video generation through APIs. Veo 3.1 supports image/reference-guided video and native vertical 9:16 output, which is suitable for UGC-style ad creative jobs. Keep generated-person creatives clearly treated as AI-generated content rather than fabricated customer testimonials.

## Safety / publishing

The designer is fail-closed:

- It never publishes a design that fails the configured margin threshold.
- Qikink creation is disabled until its exact endpoint and credentials are configured.
- Designs are stored as `AI_DRAFT` before supplier-side automation.
- No copyrighted characters, logos or existing brand identities should be requested by the designer.
- Generated visuals are marked `AI_GENERATED`.
