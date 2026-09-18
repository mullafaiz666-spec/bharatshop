# Autom8AI Creative Orchestration

_Last updated: 2026-09-18_

## Purpose

Autom8AI is used as a **workflow orchestration layer** for two BharatShop workflows:

1. Marketing short-video generation.
2. Fashion Designer creative / UGC orchestration for approved BharatDrip and BharatShop Studio products.

Autom8AI is **not treated as the media renderer itself**. The Autom8AI workflow can call Higgsfield or another configured image/video worker. BharatShop does not hard-code undocumented Autom8AI provider fields.

## Safety boundary

Autom8AI receives a review-only creative job.

It cannot directly:
- publish or unpublish a BharatShop product,
- change product pricing,
- change product profitability or supplier data,
- bypass the original-art/IP gate,
- spend ad budget,
- activate paid campaigns,
- create customer orders,
- change payment status.

Returned assets remain subject to BharatShop review and existing approval gates.

## Required environment variables

```
AUTOM8AI_WEBHOOK_URL=
AUTOM8AI_WEBHOOK_TOKEN=
```

Do not commit real secret values.

The webhook URL must use HTTPS unless it targets localhost.

## BharatShop endpoint

```
GET  /api/automation/autom8ai
POST /api/automation/autom8ai
```

Authorization:
- signed admin session, or
- existing BharatShop automation token.

### Marketing video action

```json
{
  "action": "marketing-video",
  "productId": 123,
  "platforms": ["Instagram Reels"],
  "objective": "Create a product launch Reel",
  "hook": "Your first-three-second hook",
  "cta": "Shop now"
}
```

BharatShop only dispatches this workflow for a Published product with positive recorded profit.

### Fashion creative action

```json
{
  "action": "fashion-creative",
  "productId": 123,
  "objective": "Create a BharatDrip UGC/video concept"
}
```

BharatShop only dispatches this workflow for:
- BharatDrip or BharatShop Studio,
- Qikink supplier,
- made-to-order inventory mode,
- Qikink production supplier metadata,
- original-art policy,
- positive profitability.

## Outgoing webhook contract

BharatShop sends:

```json
{
  "schema": "bharatshop.autom8ai.v1",
  "event": "bharatshop.marketing.video.requested",
  "requestedAt": "ISO-8601 timestamp",
  "source": "marketing-cockpit",
  "safety": {
    "autoPublish": false,
    "adSpend": false,
    "productMutation": false,
    "requiresHumanReview": true
  },
  "renderHints": {},
  "product": {},
  "creative": {}
}
```

Fashion jobs use event:

```
bharatshop.fashion.creative.requested
```

The request includes:

```
Authorization: Bearer <AUTOM8AI_WEBHOOK_TOKEN>
Content-Type: application/json
```

## Optional webhook response fields

BharatShop does not require a proprietary Autom8AI response schema. It safely recognizes these optional fields when present:

```json
{
  "status": "accepted",
  "jobId": "job-123",
  "assetUrl": "https://...",
  "workflowUrl": "https://...",
  "message": "Queued"
}
```

Aliases `state`, `runId`, `id`, `videoUrl`, `outputUrl`, and `runUrl` are also accepted.

Only HTTPS asset/workflow URLs are surfaced.

## Cockpit integration

Marketing:
`/dashboard/marketing` -> Pipeline -> select product -> **Autom8AI video**

Fashion:
`/dashboard/fashion` -> Live catalogue output -> **Autom8AI creative**

Read-only connection verification never calls the Autom8AI webhook because doing so could trigger a workflow. A real connection test happens only when an operator explicitly queues a creative job.

## Renderer recommendation

Recommended workflow:

```
BharatShop
 -> Autom8AI webhook
 -> validate BharatShop schema
 -> prepare script / scenes / shot list
 -> Higgsfield or configured video renderer
 -> save result in the Autom8AI workflow
 -> return job ID / workflow URL / asset URL when available
 -> human review
 -> approved marketing publication through existing BharatShop connectors
```

Keep paid ad activation and product publication outside the Autom8AI workflow unless a future explicitly approved architecture changes that policy.
