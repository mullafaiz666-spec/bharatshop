# Provider and cost amendment — 2026-09-08

This revision applies the owner's free/local Gemma instruction to the supplied TRD. OpenAI-compatible refers to an API format, not permission to call paid OpenAI or Anthropic services. SearXNG remains the search provider. Text, tool execution and pixel-based vision must be tested independently. Keyword matching never satisfies vision acceptance.

Models run on existing suitable hardware; no paid capacity is provisioned. A small text-only model cannot satisfy the image gate. Missing capacity is a blocker, not permission to weaken verification. Optional image generation requires a separately configured local service.

The original phased requirements follow, with provider names aligned to this amendment. Implementation status is tracked in `../ops/TRD_ACCEPTANCE_STATUS.md`.

You are taking over the existing BharatShop project.

Treat the following as the authoritative Technical Requirements Document (TRD) for the project. Preserve the existing architecture where it works, repair what is broken, and implement the requirements in phased order.

# BHARATSHOP — TECHNICAL REQUIREMENTS DOCUMENT

## 1. SYSTEM OBJECTIVE

Build BharatShop as a production-grade autonomous commerce platform capable of:

Product discovery
→ Supplier/source verification
→ Product enrichment
→ Image acquisition and verification
→ Pricing and margin calculation
→ Listing creation
→ Marketing/creative generation
→ Advertising
→ Customer order
→ Order re-check
→ Purchase
→ Fulfilment
→ Tracking
→ Result verification
→ Learning and optimization

The platform must operate using real data and real runtime integrations.

No disconnected demo.
No fake production responses.
No mock acceptance results.
No placeholder success.
No fabricated external API results.

---

# 2. EXISTING INFRASTRUCTURE

Project:

BharatShop

GitHub repository:

https://github.com/mullafaiz666-spec/bharatshop

Primary production:

https://bharatshop-9w4a.onrender.com

Primary deployment platform:

Render

Database:

PostgreSQL

Production PostgreSQL is the source of truth.

### DATABASE SAFETY

Never:

- DROP production database
- reset production database
- destructively reseed production data
- replace production database
- delete existing production records unnecessarily

Schema migrations must be additive and production-safe unless explicitly authorized otherwise.

---

# 3. APPLICATION ARCHITECTURE

Core operational architecture:

CEO
↓
Agents
↓
Tools
↓
Evidence
↓
Audit
↓
Decision
↓
Approval
↓
Action
↓
Result

Every important autonomous operation should be traceable through this chain.

The system must distinguish:

- requested action
- planned action
- tool invocation
- evidence
- decision
- approval
- executed action
- execution result
- verification result

---

# 4. AI CEO

The AI CEO is the orchestration layer.

Responsibilities:

- Understand business objectives
- Analyze current business state
- Decide what work is required
- Delegate tasks to appropriate agents
- Invoke or authorize tools through agents
- Evaluate evidence
- Respect approval requirements
- Review action results
- Respond naturally to the user
- Maintain traceability

The CEO must not claim an action happened unless runtime evidence confirms it.

---

# 5. AGENT SYSTEM

Required agent architecture:

### 5.1 Product Research Agent

Responsibilities:

- Discover products
- Identify product opportunities
- Collect source information
- Gather product metadata
- Compare candidate products
- Pass candidates to verification

### 5.2 Source Verification Agent

Responsibilities:

- Validate supplier/source information
- Validate product availability
- Validate source URLs
- Validate pricing
- Validate relevant source evidence
- Reject unreliable candidates

### 5.3 Image & Media Agent

Responsibilities:

- Search images
- Collect candidates
- Filter candidates
- Send candidates to vision verification
- Accept only verified images
- Persist verified media

### 5.4 Fashion Enrichment Agent

Responsibilities:

- Categorization
- Attributes
- Style
- Material
- Color
- Size
- Audience
- Search metadata
- Other category-specific enrichment

### 5.5 Listing & Marketing Agent

Responsibilities:

- Product title
- Product description
- Selling price
- Margin calculation
- Marketing copy
- SEO metadata
- Listing optimization
- Creative generation

### 5.6 Learning & Analytics Agent

Responsibilities:

- Analyze sales
- Analyze product performance
- Analyze margins
- Analyze advertising
- Identify trends
- Recommend optimization
- Feed validated learning back into the system

### 5.7 Advertising Agent

Responsibilities:

- Campaign planning
- Creative selection
- Audience strategy
- Campaign execution where integrations permit
- Performance monitoring
- Optimization

### 5.8 Order Re-check Agent

Before purchasing/fulfilment:

- Re-check product availability
- Re-check supplier price
- Re-check customer/store price
- Re-check margin
- Re-check order details
- Re-check risk conditions

### 5.9 Fulfilment & Tracking Agent

Responsibilities:

- Supplier purchase
- Fulfilment initiation
- Shipment tracking
- Tracking updates
- Delivery status
- Exceptions
- Result verification

---

# 6. TOOL SYSTEM

Tools must be real executable capabilities.

Examples:

- Product search
- Supplier search
- Source verification
- Image search
- Image verification
- Product enrichment
- Pricing
- Listing creation
- Advertising
- Order lookup
- Purchase
- Payment
- Fulfilment
- Tracking
- Analytics

Every tool call should provide structured information sufficient for auditability.

Tools must not return fake success.

Errors must propagate clearly.

---

# 7. EVIDENCE SYSTEM

Every important decision must have supporting evidence.

Evidence may include:

- Source URL
- Product data
- Supplier data
- Image URL
- Vision verification result
- Pricing data
- Inventory data
- API response
- Order information
- Shipment information
- Analytics result

Evidence should have timestamps and sufficient identifiers to trace its origin.

The system must be able to answer:

"What evidence caused this decision?"

---

# 8. AUDIT SYSTEM

Persist an audit trail for autonomous operations.

Audit records should identify, where applicable:

- actor
- CEO/agent
- tool
- operation
- input
- decision
- evidence
- approval
- action
- result
- timestamp
- status
- error

Audit history must be immutable or protected from casual alteration where practical.

---

# 9. DECISION SYSTEM

Autonomous decisions must be represented explicitly.

A decision should record:

- objective
- candidate/action
- reasoning summary
- supporting evidence
- confidence where applicable
- risk
- expected result
- selected action
- decision status

Do not store hidden chain-of-thought.

Store concise, auditable decision summaries instead.

---

# 10. APPROVAL SYSTEM

Sensitive actions must support approval enforcement.

Examples may include:

- Purchases
- Spending money
- Advertising spend
- Supplier orders
- Irreversible actions
- Other configured high-risk operations

Approval must be enforced server-side.

UI approval alone is insufficient.

If approval is required, the action must not execute until approval is valid.

---

# 11. ACTION SYSTEM

Actions must be represented independently from decisions.

Example:

Decision:
"Purchase product X."

Approval:
"Approved."

Action:
"Create supplier purchase."

Result:
"Supplier API returned order ID."

Verification:
"Supplier order lookup confirms order."

Only after verification should the system report successful completion.

---

# 12. RESULT VERIFICATION

Never trust an execution response blindly.

Where possible:

Action
→ API response
→ independent lookup/check
→ verified result

Example:

Payment initiated
→ payment API response
→ payment status lookup
→ verified payment state

Supplier order created
→ supplier response
→ supplier order lookup
→ verified supplier order

Shipment created
→ fulfilment response
→ tracking lookup
→ verified shipment

---

# 13. PRODUCT DATA

Product records should support, as applicable:

- ID
- SKU
- title
- description
- category
- attributes
- source
- supplier
- source URL
- supplier URL
- supplier cost
- store/customer price
- MRP
- margin
- inventory
- stock status
- images
- verified media
- AI marketing copy
- timestamps
- verification status

Customer-facing pricing must not accidentally use supplier wholesale cost.

---

# 14. IMAGE PIPELINE

Required architecture:

SearXNG
→ image candidates
→ filtering
→ local Gemma vision verification
→ confidence threshold
→ verified images
→ persistence
→ storefront

Configuration requirements:

MIN\_IMAGES = 4

MAX\_IMAGES = 8

MIN\_CONFIDENCE = 0.75

The image resolver must perform real work.

A successful HTTP response alone does not mean image resolution succeeded.

Acceptance requires:

1. real candidate images
2. real candidate URLs
3. real verification
4. acceptable confidence
5. persisted verified images
6. reachable storefront image URLs

Do not use placeholder images to satisfy this gate.

---

# 15. SEARXNG

SearXNG is the intended image-search provider.

It replaced SerpAPI due to quota/429 problems.

Requirements:

- Search must execute against the real SearXNG service
- Candidates must be returned
- Candidate metadata must be usable
- Image URLs must be validated
- Failed candidates must be rejected
- Results must flow into image verification

---

# 16. LOCAL VISION PROVIDER

A local multimodal Gemma model is required for image vision verification.

The system must distinguish:

Local vision provider configured

from

Local vision provider actually reachable and successfully performing verification.

Readiness must not be marked GREEN merely because an environment variable exists.

---

# 17. LOCAL AI

Local Gemma powers the CEO/AI runtime. Paid provider fallbacks are prohibited.

`/api/ceo-chat` must produce a real response.

The system must correctly handle:

- authentication/configuration
- provider errors
- timeouts
- invalid responses
- rate limits
- structured tool calls where applicable

Do not fake AI responses when the provider is unavailable.

---

# 18. API REQUIREMENTS

Important production endpoints include:

`/api/health`

`/api/storefront/products`

`/api/catalog/image-resolve`

`/api/ceo-chat`

Endpoints must:

- validate input
- authenticate/authorize where required
- return correct HTTP status
- expose useful errors
- avoid leaking secrets
- use real database data
- handle provider failures
- be observable

GET/POST semantics must be correct.

For example, if `/api/ceo-chat` requires POST, a GET 405 should not be interpreted as a system failure.

---

# 19. HEALTH SYSTEM

`/api/health` must represent meaningful production readiness.

It should verify relevant infrastructure rather than simply returning "OK".

At minimum, where configured:

- application
- PostgreSQL
- Local text inference
- Local vision inference
- critical dependencies

Health status must distinguish:

healthy
degraded
unavailable

Do not report healthy when a required production dependency is unavailable.

---

# 20. STOREFRONT

The storefront must use real PostgreSQL product data.

`/api/storefront/products` must return actual production products.

Product images must be real verified media where the image pipeline is required.

No hardcoded product lists.

No fabricated product metrics.

---

# 21. DASHBOARD / COMMAND CENTRE

UI concept:

BHARATSHOP // COMMAND CENTRE

Primary flow:

CEO
→ Agents
→ Tools
→ Evidence
→ Audit
→ Approval
→ Action
→ Result

Dashboard should show real state.

Relevant metrics:

- Products
- Revenue
- Orders
- Profit
- Margin
- Pending approvals
- Agent status

Do not display fake metrics simply to make the dashboard look complete.

---

# 22. PURCHASE QUEUE

Provide an operational Purchase Queue / Orders to Purchase capability.

It should show orders/products requiring purchasing action.

Before purchase:

- verify order
- verify supplier
- verify price
- verify stock
- calculate expected margin
- apply approval rules

After purchase:

- persist supplier order
- verify order
- update state
- record evidence/audit

---

# 23. PAYMENTS

Previously integrated payment providers include:

Cashfree

Razorpay

Payment handling must use real webhooks/status verification where implemented.

Never mark payment successful based solely on a client-side signal.

Verify payment state server-side.

---

# 24. SUPPLIER INTEGRATIONS

Potential/previously discussed sources:

- Dropdash
- DeoDap
- IndiaMART
- Meesho
- SHEIN
- Qikink

Only use an integration as "active" when it is actually configured and reachable.

Supplier pricing must come from the real supplier/source when the integration is intended to be live.

---

# 25. ORDER PIPELINE

Required operational flow:

Customer order
→ order validation
→ payment verification
→ product availability check
→ supplier/source re-check
→ pricing/margin re-check
→ approval if required
→ supplier purchase
→ purchase verification
→ fulfilment
→ tracking
→ delivery
→ result
→ analytics/learning

---

# 26. MARKETING

Listing/creative agent should be capable of producing:

- optimized title
- description
- selling price
- margin
- marketing copy
- SEO information
- advertising creative inputs

Advertising agent should support appropriate real integrations when configured.

Marketing actions involving spending must obey approval policies.

---

# 27. LEARNING LOOP

Learning should be based on real observed data.

Potential signals:

- sales
- conversion
- revenue
- margin
- returns
- advertising performance
- supplier reliability
- fulfilment performance
- product popularity

Do not "learn" from fabricated data.

Recommendations should be traceable to actual observations.

---

# 28. SECURITY

Requirements:

- Secrets only in environment/configuration systems
- No API keys committed to Git
- Server-side authorization
- Approval enforcement server-side
- Input validation
- Safe database access
- Protection against unauthorized autonomous actions
- No sensitive information in logs
- Secure webhook validation where supported

---

# 29. ERROR HANDLING

Errors must be explicit.

Never:

- catch an error and return fake success
- convert provider failure into PASS
- silently ignore failed tool calls
- mark a workflow complete when only configuration succeeded

Every important failure should be observable in:

- logs
- API result
- workflow state
- audit record where appropriate

---

# 30. GITHUB ACTIONS / CI

GitHub Actions must provide reliable validation.

Workflows should:

- install dependencies
- lint/typecheck as appropriate
- build
- run tests
- fail on genuine application errors
- avoid hiding failures
- deploy only when appropriate

A workflow passing does not prove production functionality.

Production runtime verification is still required.

---

# 31. RENDER DEPLOYMENT

Render is the primary production platform.

After deployment:

1. Verify deployment state
2. Inspect logs
3. Verify application startup
4. Verify database connectivity
5. Verify critical endpoints
6. Verify AI providers
7. Verify actual workflows

Do not report deployment success as application success.

---

# 32. OBSERVABILITY

Important operations should expose:

- request ID where appropriate
- agent ID
- tool ID
- operation ID
- timestamps
- status
- errors
- provider information
- execution duration where useful

Logs must be useful for debugging without exposing secrets.

---

# 33. TESTING STRATEGY

Testing must exist at multiple levels:

### Unit

Business logic and utilities.

### Integration

Database and provider integrations.

### API

Critical endpoint behavior.

### Agent

Agent/tool orchestration.

### Governance

Evidence/audit/approval enforcement.

### End-to-End

Real production acceptance chain.

### Deployment

Render/GitHub Actions verification.

Tests must test actual behavior.

Do not weaken tests simply to achieve green CI.

---

# 34. PRODUCTION ACCEPTANCE GATES

Final acceptance requires:

1. Render reachable
2. Health endpoint verified
3. PostgreSQL verified
4. Local text inference verified
5. Local vision inference verified where required
6. Real products returned
7. Real images available
8. SearXNG search verified
9. local Gemma vision verification verified
10. Image persistence verified
11. CEO response verified
12. CEO delegation verified
13. Agent execution verified
14. Tool execution verified
15. Evidence persistence verified
16. Audit persistence verified
17. Decision persistence verified
18. Approval enforcement verified
19. Action execution verified
20. Result verification verified
21. Natural CEO result verified
22. CI verified
23. Deployment verified
24. No critical production errors

---

# 35. STATUS DEFINITIONS

Every major requirement must be classified:

🟢 VERIFIED
Real runtime evidence exists.

🟡 PARTIAL
Implemented but incomplete or insufficiently verified.

🔴 BROKEN
Fails runtime or implementation requirements.

⚪ NOT TESTED
No reliable evidence yet.

Configuration alone = NOT VERIFIED.

Source-code existence alone = NOT VERIFIED.

Successful deployment alone = NOT VERIFIED.

---

# 36. PHASED IMPLEMENTATION ORDER

## PHASE 1

Repository and architecture audit.

## PHASE 2

Production/database integrity.

## PHASE 3

Health and provider readiness.

## PHASE 4

Product/catalog pipeline.

## PHASE 5

SearXNG + image verification.

## PHASE 6

CEO → Agent → Tool runtime.

## PHASE 7

Evidence → Audit → Decision → Approval.

## PHASE 8

Action → Result → Verification.

## PHASE 9

Orders → Purchase → Fulfilment → Tracking.

## PHASE 10

Listing → Marketing → Advertising.

## PHASE 11

Learning → Analytics → Optimization.

## PHASE 12

CI/CD → Reliability → Observability.

## PHASE 13

Full production acceptance test.

---

# 37. NON-NEGOTIABLE ENGINEERING PRINCIPLES

The following rules override convenience:

REAL DATA > MOCK DATA

REAL RUNTIME > CONFIGURATION

VERIFIED RESULT > HTTP 200

ROOT-CAUSE FIX > WORKAROUND

PRODUCTION SAFETY > QUICK RESET

EVIDENCE > CLAIM

APPROVAL ENFORCEMENT > UI APPEARANCE

INDEPENDENT VERIFICATION > SELF-REPORTED SUCCESS

PRESERVE WORKING SYSTEM > UNNECESSARY REWRITE

---

# 38. TAKEOVER INSTRUCTION

You are inheriting an existing project.

First inspect the actual GitHub repository and Render deployment.

Do not invent missing information.

Do not assume previous work is correct.

Do not rebuild the project from scratch.

Do not replace working functionality unnecessarily.

Do not reset the production database.

Identify the actual current state.

Then:

1. Audit
2. Identify blockers
3. Fix root causes
4. Commit changes
5. Deploy where appropriate
6. Verify production
7. Update the gate table
8. Continue to the next phase

At every stage report:

- What was found
- What was changed
- Why it was changed
- What was tested
- Actual result
- Remaining blockers

The final objective is a **real, production-ready autonomous BharatShop commerce system**, not a simulated demonstration.

Begin with the repository + production audit.
