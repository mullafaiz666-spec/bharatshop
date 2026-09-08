# TRD implementation and acceptance — 2026-09-08

Baseline audited: main `b2724b515b68bd613b3b7662de2151168fa26435`. Concurrent main update `8830f36bfb727ee7b6ba3bdda1c2be20de5f6a0b` was inspected; its concurrent health probes and bounded token generation are preserved.

## Findings and changes

- Gateway previously discarded image parts, tools and requested model. It now authenticates, preserves OpenAI-compatible payloads and propagates errors. Gemma JSON planning is validated before server-side dispatch.
- Local keyword scoring was labeled verified vision. Real pixel input and typed verdict validation replace that shortcut. The four-image / 0.75-confidence gate is shared by storefront and listing; historical evidence is preserved.
- Health had unexercised green dependencies. Liveness is separate; deep readiness exercises text, image pixels, search and PostgreSQL.
- Forced schema push is blocked. This branch contains no schema migration or production database write.
- Tool scope is enforced at dispatch; missing audit writes prevent completion claims. Approval dispatch atomically claims an approved row to stop replay. A dispatch response remains distinct from independent result verification.
- Storefront detail no longer exposes an arbitrary product row, supplier costs or unpublished products.
- Remaining direct paid AI/search calls use the local provider and SearXNG adapters. Optional local image generation is blocked when unconfigured.

## Acceptance gates

These are production statuses, not unit test statuses. Source existence and regression tests do not establish live acceptance.

| Requirement | Status | Evidence / blocker |
|---|---|---|
| Repository audit | VERIFIED | Actual current GitHub source inspected |
| Render deployment reachable | NOT TESTED | Public fetch unavailable; Render requires workspace confirmation |
| PostgreSQL connectivity and integrity | NOT TESTED | No production database access performed |
| Local text inference | PARTIAL | Adapter and regression tests; live endpoint not exercised |
| Local vision inference | PARTIAL | Pixel payload and verdict checks; live model not exercised |
| SearXNG / real candidate images | NOT TESTED | Live service unavailable for inspection |
| Verified media persistence and storefront reachability | PARTIAL | Strict code gate; no production resolution performed |
| Real catalogue products | NOT TESTED | No production query performed |
| CEO / agents / tools | PARTIAL | Scoped dispatch and Gemma planner; full runtime chain pending |
| Evidence / audit / decisions | PARTIAL | Failure propagation tightened; production persistence untested |
| Approval enforcement | PARTIAL | Atomic claim and server authorization; production concurrency test pending |
| Action / independent verification | PARTIAL | Dispatch explicitly distinguishes unverified result; reconciliation still required |
| Orders / supplier purchase / payments / tracking | NOT TESTED | Real provider credentials and runtime evidence required |
| Marketing / advertising / learning | PARTIAL | Local adapters; external execution and evidence not verified |
| CI and build | NOT TESTED | Await branch CI; local dependency installation unavailable |
| Production acceptance | NOT TESTED | No full acceptance chain has run |

## Local validation

Six Node regression tests exercise gateway authentication, model/image/tool payload preservation, malformed provider output, unauthorized tool plans, readiness, media confidence and tool argument validation. They use controlled test upstreams, not real inference. No test writes to production.

## Remaining work and deployment constraints

1. Confirm Render workspace `My Workspace` before using its service tools (required by Render connector).
2. Inspect actual web/gateway service build/start settings, model host capacity and existing environment before deploying. Root Dockerfile is an AI gateway deployment, not the Next.js web build; preserve existing service distinctions.
3. Configure authenticated gateway and multimodal model on existing suitable hardware. The prior tiny text model and keyword verifier do not meet the TRD.
4. Set web liveness path `/api/live` before releasing readiness changes. Run CI, deploy selected services and exercise protected deep readiness.
5. Run real image resolution and verify persisted rows and reachable images. Strict gates may remove previously keyword-approved items from storefront responses; records are retained.
6. Finish independent post-action lookups, durable reconciliation for interrupted EXECUTING actions, supplier/payment workflows and full acceptance gates. Do not automatically retry uncertain purchases.
7. Audit remaining legacy routes for complete session-expiry enforcement, supplier freshness, automation permissions and generated-media provenance before claiming production readiness.

No deployment success, free-compute availability or complete autonomous commerce operation is claimed by this patch.
