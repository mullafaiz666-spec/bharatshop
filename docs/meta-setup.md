# BharatShop Meta configuration

Open `/dashboard/meta` while signed in, or use the **Meta setup** dashboard link.
This screen reports missing environment variables, invalid IDs, mismatched Pixel
IDs, test mode, and account-access verification results. It never displays tokens.
Configuration presence is not evidence of a working provider connection.

## Render settings

Add the variables in `.env.example` to the existing service environment; retain all
existing database, payment, authentication and free local-AI settings. Never put a
token in a `NEXT_PUBLIC_` variable. Redeploy after changing public settings because
Next.js embeds them during the build.

| Setting | Value |
| --- | --- |
| NEXT_PUBLIC_META_PIXEL_ID | Numeric website Pixel/Dataset ID from Events Manager |
| META_PIXEL_ID | Same ID; can be omitted to use the public ID |
| META_CONVERSIONS_API_TOKEN | Server-only token generated for that dataset |
| NEXT_PUBLIC_META_DOMAIN_VERIFICATION | Verification code for the owned storefront domain |
| META_PAGE_ID | Numeric Facebook Page ID |
| META_INSTAGRAM_ACCOUNT_ID | Numeric Instagram Business account ID linked to the Page |
| META_ACCESS_TOKEN | Server-only token with access to the selected business assets |
| META_AD_ACCOUNT_ID | Optional numeric ad account ID, with or without act_ prefix |
| META_CATALOG_ID | Optional catalog ID for setup inventory; no automatic catalog upload |
| META_GRAPH_API_VERSION | Version used by the existing connector; default v26.0 |
| META_TEST_EVENT_CODE | Temporary Events Manager test code; remove after validation |

## Catalog and domain

Add `https://bharatshop-9w4a.onrender.com/api/feeds/meta-catalog` as a scheduled feed
in Commerce Manager (use the custom storefront hostname if configured). The feed
contains products that pass the existing storefront publication policy. Zero rows
is a catalog-readiness issue, not a reason to insert demo products.

Complete domain verification in Meta Business Settings after deployment. You need
control of the domain you verify; a verification tag alone does not confirm ownership.

## Verification

1. Use **Verify connections** on the setup page. These are read-only Graph API
   account-access checks, not test-event sends or campaign publication.
2. With a temporary test-event code, visit the storefront, open products and add
   items to the cart. Check Events Manager for accepted events.
3. Browser and server copies of a storefront event share an event ID for
   deduplication. Their Pixel/Dataset IDs must also match. Page views wait for the
   Pixel queue to initialize and follow storefront navigation.
4. Validate Purchase only through an actual authorized payment flow. Public event
   ingestion cannot submit Purchase. Analytics failure must not fail a payment.
5. Remove the test-event code and deploy again after verification.

Paid advertising remains disabled. The existing campaign connector only prepares
paused containers under its existing approval rules. Configuring credentials does
not enable spending, publish social posts, or certify the whole project as live.

Official reference: [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/).
