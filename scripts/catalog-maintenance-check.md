# Catalog maintenance

The live catalog endpoint is `/api/automation/catalog-maintenance`. The GitHub workflow should pass the deployed Render URL through the `BHARATSHOP_URL` repository secret. If the secret is missing, the workflow must report a clear configuration warning instead of attempting an empty URL. The application itself remains usable and seeded products remain visible according to storefront publication rules.
