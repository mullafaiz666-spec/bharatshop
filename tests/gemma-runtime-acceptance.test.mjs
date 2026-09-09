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

test("production acceptance verifies current storefront media and real Gemma inference", () => {
  const src = read("scripts/production-acceptance-v4.mjs");
  assert.match(src, /GATE 6 Storefront media live/);
  assert.match(src, /GATE 10 Local Gemma inference/);
  assert.match(src, /modelReady/);
  assert.match(src, /ai-agent-live/);
  assert.doesNotMatch(src, /BharatDrip model media live/);
  assert.doesNotMatch(src, /fashion-designer/);
});

test("CEO uses a compact Gemma decision protocol suitable for free CPU", () => {
  const src = read("src/app/api/ceo-chat/route.ts");
  assert.match(src, /TOOL:<tool_name>/);
  assert.match(src, /ANSWER:<max 28 words>/);
  assert.match(src, /maxTokens: 36/);
  assert.match(src, /evidenceDigest/);
  assert.match(src, /gemma-compact-plan-act/);
  assert.match(src, /modelStatus: "live"/);
  assert.doesNotMatch(src, /maxTokens: 240/);
  assert.doesNotMatch(src, /maxTokens: 280/);
  assert.doesNotMatch(src, /humanFallback/);
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
