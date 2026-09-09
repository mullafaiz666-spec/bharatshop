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
  assert.doesNotMatch(src, /BharatDrip model media live/);
  assert.doesNotMatch(src, /fashion-designer/);
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

test("CEO cycle activates human order gating only for genuine client orders", () => {
  const src = read("src/app/api/automation/ceo-cycle/route.ts");
  assert.match(src, /function isRealClientOrder/);
  assert.match(src, /\^BS-WEB-/);
  assert.match(src, /orderCandidates\.filter\(isRealClientOrder\)/);
  assert.match(src, /humanInteractionGate:false/);
  assert.match(src, /Human order gating starts only when a genuine client order exists/);
});

test("CEO uses a tiny Gemma decision protocol suitable for free CPU", () => {
  const src = read("src/app/api/ceo-chat/route.ts");
  assert.match(src, /TOOL:<name>/);
  assert.match(src, /ANSWER:<max 16 words>/);
  assert.match(src, /maxTokens: 20/);
  assert.match(src, /tinyFacts/);
  assert.match(src, /gemma-compact-plan-act/);
  assert.match(src, /modelStatus: "live"/);
  assert.doesNotMatch(src, /evidenceDigest/);
  assert.doesNotMatch(src, /maxTokens: 36/);
  assert.doesNotMatch(src, /maxTokens: 240/);
  assert.doesNotMatch(src, /maxTokens: 280/);
  assert.doesNotMatch(src, /humanFallback/);
});

test("CEO parser accepts compact approval tool variants without bypassing Gemma", () => {
  const src = read("src/app/api/ceo-chat/route.ts");
  assert.match(src, /function normalizeModelTool/);
  assert.match(src, /JSON\.parse\(cleaned\)/);
  assert.match(src, /p: "create_approval"/);
  assert.match(src, /createapproval: "create_approval"/);
  assert.match(src, /requestapproval: "create_approval"/);
  assert.match(src, /TOOL\\s\*:\\s\*\(\[\^\\n\]\+\)/);
});

test("approval arguments are extracted only after Gemma chooses the approval tool", () => {
  const src = read("src/app/api/ceo-chat/route.ts");
  const plannerPos = src.indexOf("const decision = await planWithGemma");
  const normalizePos = src.indexOf("const args = normalizeToolArgs", plannerPos);
  assert.ok(plannerPos >= 0);
  assert.ok(normalizePos > plannerPos);
  assert.match(src, /tool === "create_approval"/);
  assert.match(src, /parseApprovalIntent\(question\)/);
});