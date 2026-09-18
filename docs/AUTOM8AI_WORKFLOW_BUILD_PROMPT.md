# Autom8AI Workflow Build Prompt

_Last updated: 2026-09-18_

Paste the following into Autom8AI's workflow builder after the Generic Webhook Trigger is active.

## Workflow prompt

When the Generic Webhook Trigger receives a BharatShop payload, inspect `schema`, `event`, `product`, `creative`, `renderHints`, and `safety`.

### Connection test

If `event = bharatshop.connection.test`:
- acknowledge receipt only;
- do not invoke an AI model or renderer;
- do not publish, spend, mutate products, create orders, create payments, or call the BharatShop result callback.

### Marketing video

If `event = bharatshop.marketing.video.requested`:
1. Validate `schema = bharatshop.autom8ai.v1`.
2. Preserve the supplied product facts and verified imagery.
3. Create a short-form concept, 8-30 second script, shot list, caption, CTA, and renderer-ready prompt.
4. Send the renderer-ready prompt and supplied imagery to Higgsfield when a supported Higgsfield connection is available; otherwise use the explicitly configured video renderer.
5. Never invent testimonials, ratings, product claims, prices, discounts, or product features.
6. Keep the output review-only.

### Fashion creative

If `event = bharatshop.fashion.creative.requested`:
1. Validate `schema = bharatshop.autom8ai.v1`.
2. Preserve the supplied Qikink garment, original-art policy, artwork direction, palette, print method, and trend direction.
3. Create a fashion campaign concept, UGC-style vertical-video brief, shot list, caption, CTA, and renderer-ready prompt.
4. Send it to Higgsfield when a supported Higgsfield connection is available; otherwise use the explicitly configured creative renderer.
5. Do not introduce third-party logos, characters, franchises, or unlicensed IP.
6. Keep the output review-only.

### Result handoff

After a render reaches a terminal state, send a POST request to the configured BharatShop result callback URL.

Use:
- `Content-Type: application/json`
- `Authorization: Bearer <BHARATSHOP_AUTOMATION_TOKEN>`

Body:

```json
{
  "productId": 123,
  "workflow": "marketing-video",
  "status": "COMPLETED",
  "jobId": "provider-job-id",
  "renderer": "higgsfield",
  "assetUrl": "https://...",
  "workflowUrl": "https://...",
  "message": "Render complete and ready for review."
}
```

Allowed `workflow` values:
- `marketing-video`
- `fashion-creative`

Allowed `status` values:
- `QUEUED`
- `RENDERING`
- `COMPLETED`
- `FAILED`
- `NEEDS_REVIEW`

For `COMPLETED`, include an HTTPS `assetUrl` or `workflowUrl`.

The callback stores an audit result only. It never changes product records, never publishes, never spends ad budget, and never creates orders or payments.

## BharatShop callback

```
POST /api/automation/autom8ai/result
GET  /api/automation/autom8ai/result?productId=<id>
```

The callback requires the existing BharatShop automation token. Keep the token in Autom8AI credentials/secrets, never in a workflow text field or repository file.
