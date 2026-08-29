# BharatShop final automation lock

- Vercel is the primary application runtime.
- DATABASE_URL connects Vercel functions to PostgreSQL.
- products -> product_images -> dashboard/storefront is the publication data path.
- AI agents run from the Vercel cron endpoint every 5 minutes, 24x7.
- Research agents create CEO_PENDING candidates only.
- CEO-Agent verifies source evidence, image evidence, stock and unit economics.
- Only CEO_APPROVED products can enter Listing-Creative-Agent and become Published.
- CEO does not make timed fulfillment decisions. A real storefront order is the gate for order review/human interaction.
- Qikink credentials are not introduced by this automation layer.
