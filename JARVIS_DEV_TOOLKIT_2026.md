# JARVIS Developer Toolkit 2026

This document turns the 2026 developer-toolkit reference into a **capability map for Jarvis/BharatShop** without replacing the existing production architecture.

## 1. Core engineering layer

| Capability | Tool | Jarvis role | Status |
|---|---|---|---|
| Editor | VS Code | Primary local development workspace | Recommended |
| UI | React | Existing application UI | Core |
| Styling | Tailwind CSS | Existing utility styling | Core |
| Browser debugging | Chrome DevTools | Runtime/network/performance verification | Recommended |
| Design | Figma | UI/UX source and design handoff | Optional |
| CSS preprocessing | Sass | Only where a real Sass surface is needed | Optional |
| Git hosting | GitHub | Source control, PRs, CI/evidence | Core |
| Runtime | Node.js | Next.js/API/agent scripts | Core |
| API | Express.js | Only for isolated services that need Express | Optional |
| Database | PostgreSQL | Production source of truth | Core |
| Containers | Docker | Local service isolation and reproducible tooling | Core |
| API testing | Postman | Integration and webhook verification | Recommended |
| Cache/queue | Redis | Optional durable queue/cache layer | Optional |

## 2. AI/agent layer

| Tool | Jarvis role | Integration rule |
|---|---|---|
| ChatGPT | General AI/operator interface | Use through approved connector/API surface |
| Claude | Verification/review capability | Keep behind existing evidence boundary |
| Claude Code | Coding agent | Development-time only |
| Cursor | Alternative coding IDE | Development-time only |
| GitHub Copilot | Inline coding assistance | Development-time only |
| LangChain | Agent/tool orchestration library | Use only where it adds a concrete orchestration boundary |
| v0 | UI prototyping | Development-time |
| Perplexity | Research interface | Research only; no fabricated evidence |
| Warp | Terminal workflow | Developer workstation |
| Notion | Planning/documentation | Optional knowledge workspace |
| Replit | Prototyping | Development-time only |
| Galileo AI | UI ideation | Design-time only |
| Framer AI | Marketing/UI ideation | Design-time only |

## 3. Data/service tools shown in the reference

MongoDB and MySQL are registered as optional integration targets, not replacement databases. Supabase may be used for verification/experimentation where already supported.

**Production remains Render + the existing PostgreSQL database.**

Vercel and Railway are **not production targets for Jarvis**, even though they appear in the reference image. They can be discussed as external developer tools, but Jarvis must not silently move deployment ownership to them.

## 4. Jarvis control plane

All actual agent actions continue to follow:

**CEO → Agent → Tool → Evidence → Audit → Decision → Human Approval → Action → Verified Result**

The toolkit does not bypass authentication, payment protection, approval gates, production database protection, or evidence requirements.

## 5. What "integrated" means

Jarvis should expose one internal tool registry with:

- tool name and category
- local/remote capability
- health/status endpoint when available
- configuration state without exposing secrets
- supported actions
- evidence requirements
- approval requirement
- production-safe flag
- owner/agent allowed to invoke it

External desktop/SaaS tools are **not bundled into the web application**. They are registered as developer capabilities and connected only through supported APIs/connectors.

## 6. Acceptance gates

A toolkit item is not marked PASS merely because its package or configuration exists.

For an operational integration, Jarvis must have runtime evidence for:

1. configuration present
2. connectivity/health verified
3. capability exercised
4. evidence recorded
5. audit event recorded
6. approval boundary respected
7. result verified

No fake PASS states.

## 7. Existing architecture preserved

This toolkit is additive. It does not:

- reset or replace the production PostgreSQL database
- replace the current Render production authority
- move production to Vercel or Railway
- replace the existing CEO/agent/evidence/approval chain
- introduce paid AI providers as an unapproved production dependency
- bypass supplier-purchase authorization

The purpose is to give Jarvis a coherent 2026 developer/AI tool layer while preserving the working BharatShop system.
