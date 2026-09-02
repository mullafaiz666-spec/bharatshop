# BharatShop final automation lock

## Architecture authority

- Render is the primary production application and PostgreSQL authority.
- GitHub is the source-of-truth for application code, orchestration contracts, CI and review.
- Gemma 3 4B via llama.cpp on Termux is the local AI model/agent execution layer where practical; it is not the production authority.
- Vercel is not the production acceptance authority.

## Agent execution contract

- Agent automation follows: Research -> Verify -> Learn -> CEO -> specialist agents -> approved actions -> feedback loop.
- Research uses public/authorized sources only. Raw Google result-page scraping is prohibited.
- Research findings are evidence, not truth; verification/scoring must precede consequential decisions.
- CEO delegates only through typed, agent-scoped tools and approval policies.
- Consequential purchases, spending, financial changes, risky publishing and external commitments require human approval.
- Every consequential action must retain evidence, authorization, target, result and metrics in the audit trail.

## Publication and order safety

- products -> product_images -> dashboard/storefront is the publication data path.
- Only sufficiently verified products/images may enter the publication path.
- CEO does not invent fulfilment, purchase, shipment or financial outcomes.
- A real storefront order is the gate for order review and fulfilment interaction.
- Qikink/supplier credentials are not introduced by this automation layer.

## Integration sequencing

- Local Gemma execution and the end-to-end agent path must be verified before live advertising, payment or supplier automation is enabled.
- Payment, advertising and supplier integrations remain explicitly unverified until their own sandbox/readiness/acceptance gates pass.
- Product population is not a completion criterion for this architecture/Gemma milestone.
