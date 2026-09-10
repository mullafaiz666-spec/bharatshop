import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("tiny Gemma CEO read-only requests use the bounded compact primary runtime", () => {
  const route = read("src/app/api/ceo-chat/route.ts");
  const compact = read("src/lib/agents/compact-runtime.ts");

  assert.match(route, /"image & media": "image-media"/);
  assert.match(route, /useBoundedFreeTierCeo/);
  assert.match(route, /isTinyGemmaModel\(aiModels\(\)\.text\)/);
  assert.match(route, /runCompactAgentRuntime/);
  assert.match(route, /maxAttempts: 1/);
  assert.match(route, /if \(!compactPrimary && primary\.modelStatus === "unavailable"\)/);

  assert.match(compact, /"image-media"/);
  assert.match(compact, /isTinyGemmaModel/);
  assert.match(compact, /tinyModel \? 1 : 2/);
  assert.match(compact, /timeoutMs: tinyModel \? 35_000 : 45_000/);
});

test("compact evidence runtime persists real tool observations and a CEO decision audit", () => {
  const compact = read("src/lib/agents/compact-runtime.ts");
  assert.match(compact, /recordToolExecution/);
  assert.match(compact, /auditId/);
  assert.match(compact, /eventType: "CEO_DECISION"/);
  assert.match(compact, /live evidence-backed decision response/);
  assert.doesNotMatch(compact, /deterministic summary/);
});

test("production acceptance tolerates only the known supplier-policy 429 without faking evidence", () => {
  const workflow = read(".github/workflows/production-acceptance.yml");
  assert.match(workflow, /BLOCKED_SUPPLIER_POLICY_EVIDENCE/);
  assert.match(workflow, /Number\(d\.policy\?\.status\)===429/);
  assert.match(workflow, /Catalog was left unchanged/);
  assert.match(workflow, /continuing core production acceptance without inventing supplier evidence/);
  assert.match(workflow, /Unexpected DeoDap bootstrap failure/);
});
