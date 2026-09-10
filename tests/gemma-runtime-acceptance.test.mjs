import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("AI provider honors a configured free-tier timeout floor", () => {
  const src = read("src/lib/ai/provider.ts");
  assert.match(src, /AI_MIN_TIMEOUT_MS/);
  assert.match(src, /Math\.max\(timeoutMs, floor\)/);
  assert.match(src, /effectiveTimeoutMs/);
});

test("deep AI health reuses only a short recent successful model verification", () => {
  const src = read("src/lib/ai/provider.ts");
  assert.match(src, /MODEL_READY_CACHE_TTL_MS = 120_000/);
  assert.match(src, /lastVerifiedModelReadyAt/);
  assert.match(src, /Date\.now\(\) - lastVerifiedModelReadyAt < MODEL_READY_CACHE_TTL_MS/);
  assert.match(src, /reason: "model_ready_recently_verified"/);
  assert.match(src, /if \(modelReady\) lastVerifiedModelReadyAt = Date\.now\(\)/);
  assert.match(src, /providerUrl\("\/models"\)/);
});

test("production acceptance no longer bootstraps the removed fashion system", () => {
  const workflow = read(".github/workflows/production-acceptance.yml");
  assert.doesNotMatch(workflow, /api\/fashion-designer/);
  assert.match(workflow, /production-acceptance-v4\.mjs/);
});

test("production acceptance prep does not run the heavy CEO merchandising cycle", () => {
  const workflow = read(".github/workflows/production-acceptance.yml");
  assert.match(workflow, /api\/automation\/order-gate-status/);
  assert.doesNotMatch(workflow, /api\/automation\/ceo-cycle/);
  assert.doesNotMatch(workflow, /\/tmp\/ceo1\.json|\/tmp\/ceo2\.json/);
});

test("lightweight order gate status uses genuine-client classification", () => {
  const src = read("src/app/api/automation/order-gate-status/route.ts");
  assert.match(src, /function isRealClientOrder/);
  assert.match(src, /\^BS-WEB-/);
  assert.match(src, /humanInteractionGate:realOrders\.length>0/);
  assert.match(src, /No human order gate before a genuine BS-WEB\/Shopify customer order/);
});

test("production acceptance verifies current storefront media and real Gemma inference", () => {
  const src = read("scripts/production-acceptance-v4.mjs");
  assert.match(src, /GATE 6 Storefront media live/);
  assert.match(src, /GATE 10 Local Gemma inference/);
  assert.match(src, /modelReady/);
  assert.match(src, /ai-agent-live/);
  assert.match(src, /modelStatus==="live"/);
  assert.doesNotMatch(src, /BharatDrip model media live/);
  assert.doesNotMatch(src, /fashion-designer/);
});

test("production acceptance permits only safe same-origin BharatShop fashion SVG mockups", () => {
  const src = read("scripts/production-acceptance-v4.mjs");
  assert.match(src, /function safeStorefrontMedia/);
  assert.match(src, /image\/svg\+xml/);
  assert.match(src, /u\.origin!==base\.origin/);
  assert.match(src, /fallback"\)!=="product-mockup"/);
  assert.match(src, /script\|foreignObject/);
  assert.match(src, /new TextDecoder\(\)\.decode/);
});

test("pre-client production acceptance has zero manual approval gates", () => {
  const src = read("scripts/production-acceptance-v4.mjs");
  assert.match(src, /GATE 15 Client order classifier/);
  assert.match(src, /GATE 16 Human gate timing/);
  assert.match(src, /api\/automation\/order-gate-status/);
  assert.match(src, /GATE 17 No synthetic approvals/);
  assert.match(src, /GATE 18 Consequential order protection/);
  assert.match(src, /0 manual gate\(s\)/);
  assert.match(src, /\^BS-WEB-/);
  assert.doesNotMatch(src, /preparedCeoCycle/);
  assert.doesNotMatch(src, /APPROVAL_TOKEN/);
  assert.doesNotMatch(src, /Create a low-risk human approval request/);
  assert.doesNotMatch(src, /"MANUAL"/);
});

test("legacy synthetic production-acceptance approvals are quarantined without deletion", () => {
  const route = read("src/app/api/ceo-approvals/route.ts");
  const tools = read("src/lib/ai/ceo-tools.ts");
  assert.match(route, /title ILIKE 'Production acceptance%'/);
  assert.match(route, /SYNTHETIC_APPROVAL_QUARANTINED/);
  assert.match(route, /destructiveCleanup:false/);
  assert.match(tools, /title NOT ILIKE 'Production acceptance%'/);
  assert.doesNotMatch(route, /DELETE FROM ceo_approvals/i);
  assert.doesNotMatch(tools, /DELETE FROM ceo_approvals/i);
});

test("CEO cycle activates human order gating only for genuine client orders", () => {
  const src = read("src/app/api/automation/ceo-cycle/route.ts");
  assert.match(src, /function isRealClientOrder/);
  assert.match(src, /\^BS-WEB-/);
  assert.match(src, /orderCandidates\.filter\(isRealClientOrder\)/);
  assert.match(src, /humanInteractionGate:false/);
  assert.match(src, /Human order gating starts only when a genuine client order exists/);
});

test("Gemma agent runtime uses bounded multi-step plan-tool-observe rather than tiny one-shot replies", () => {
  const src = read("src/lib/agents/runtime.ts");
  assert.match(src, /agent-runtime-v4-plan-tool-observe/);
  assert.match(src, /for \(let step = 1; step <= maxSteps; step\+\+\)/);
  assert.match(src, /tools: nativeTools\(agentId\)/);
  assert.match(src, /maxTokens: step === maxSteps \? 650 : 420/);
  assert.match(src, /weakAnswer/);
  assert.match(src, /shallow-answer repair/);
  assert.match(src, /delegate_agent/);
  assert.doesNotMatch(src, /ANSWER:<max 16 words>/);
  assert.doesNotMatch(src, /maxTokens: 20/);
  assert.doesNotMatch(src, /humanFallback/);
});

test("runtime supports both native tool calls and structured text fallback with arguments", () => {
  const src = read("src/lib/agents/runtime.ts");
  assert.match(src, /normalizeNativeToolCall/);
  assert.match(src, /parseTextToolCall/);
  assert.match(src, /parsed\?\.arguments \?\? parsed\?\.args \?\? parsed\?\.input/);
  assert.match(src, /toolInputError/);
  assert.match(src, /TOOL\\s\*:\\s\*/);
});

test("runtime persists agent conversation memory without altering production source-of-truth tables", () => {
  const src = read("src/lib/agents/runtime.ts");
  assert.match(src, /CREATE TABLE IF NOT EXISTS agent_chat_messages/);
  assert.match(src, /loadMemory/);
  assert.match(src, /saveMemory/);
  assert.match(src, /postgres\+request/);
  assert.doesNotMatch(src, /DROP TABLE|TRUNCATE TABLE|DELETE FROM products/i);
});

test("local Gemma gateway adapts context while preserving the bounded tool-heavy default", () => {
  const src = read("local-ai/proxy.mjs");
  assert.match(src, /function adaptiveContextLength/);
  assert.match(src, /OLLAMA_CONTEXT_LENGTH \|\| 2048/);
  assert.match(src, /promptChars <= 1200/);
  assert.match(src, /Math\.min\(configured, 512\)/);
  assert.match(src, /promptChars <= 3000/);
  assert.match(src, /Math\.min\(configured, 1024\)/);
  assert.match(src, /return configured/);
  assert.match(src, /Math\.min\(1024/);
});