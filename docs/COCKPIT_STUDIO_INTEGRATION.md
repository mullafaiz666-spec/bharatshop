# BharatShop cockpit and fashion studio integration

The uploaded operating cockpit is represented by `/dashboard/marketing`: live catalog and campaign records, content calendar, asset library, routines, review, integrations and specialist agent. Planning state persists in PostgreSQL. Sample dollar revenue, fictional sales and the prototype's fixed launch dates are not operational data.

The uploaded fashion shell is represented by `/dashboard/fashion`: editable brief, inspiration, local AI concepts, garment/color/placement variations, supplier cost estimates, saved tech-pack specifications, CEO review status and the last 20 saved design/upload audit events. The supplied shell did not include its `style.css` or `script.js`; the existing authenticated React implementation provides these features. Inspiration cards are style cues, not measured trend scores. The AI fallback is explicitly labeled. Tech packs still require production artwork and supplier confirmation.

Select a saved design and choose **Plan marketing for this design** to open its product in the cockpit pipeline. Pending designs still have to pass the existing publication and profitability gates before campaign creation. There is no new auto-publish or paid-spend path.

Design creation and photo uploads use PostgreSQL transactions. Product ownership and audit actors use the authenticated admin. A failed write rolls back the operation. Public image links use the configured public origin. No reset, destructive seed, schema replacement or migration is required.

Cockpit order value and estimated profit include only records explicitly marked PAID, excluding cancelled/refunded/returned fulfilment records. TOKEN_PAID can represent only a COD deposit and is excluded. These figures cover the latest 100 orders, not lifetime accounting or recognized revenue.

Existing original-artwork restrictions, pricing checks, server-verified payments, authentication, listing gates and PAUSED-only Meta handoff remain in force. This integration does not certify legal compliance or validate third-party credentials.

Validation: production build, TypeScript, integration tests (including transaction rollback and owner isolation), lint, followed by Render revision/health and unauthenticated route checks. Authenticated production mutations require a real admin session and are not simulated as successful.
