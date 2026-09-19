import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/app/api/automation/autom8ai/result/route.ts", import.meta.url), "utf8");
const prompt = readFileSync(new URL("../docs/AUTOM8AI_WORKFLOW_BUILD_PROMPT.md", import.meta.url), "utf8");

test("Autom8AI result callback is authenticated and review-only", () => {
  assert.ok(route.includes("BHARATSHOP_AUTOMATION_TOKEN"));
  assert.ok(route.includes("AUTOM8AI_CREATIVE_RESULT_RECEIVED"));
  assert.ok(route.includes("reviewOnly: true"));
  assert.ok(route.includes("productMutation: false"));
  assert.ok(route.includes("autoPublish: false"));
  assert.ok(route.includes("adSpend: false"));
  assert.ok(route.includes("createsOrders: false"));
  assert.ok(route.includes("createsPayments: false"));
  assert.doesNotMatch(route, /db\.update\(products\)/);
  assert.doesNotMatch(route, /insert\(productImages\)/);
});

test("Autom8AI result callback accepts only bounded workflows and statuses", () => {
  assert.ok(route.includes('new Set(["marketing-video", "fashion-creative"])'));
  assert.ok(route.includes('"QUEUED", "RENDERING", "COMPLETED", "FAILED", "NEEDS_REVIEW"'));
  assert.ok(route.includes('parsed.protocol === "https:"'));
  assert.ok(route.includes('Completed results require an HTTPS assetUrl or workflowUrl'));
});

test("Autom8AI build prompt preserves the live safety and callback contract", () => {
  assert.ok(prompt.includes("bharatshop.connection.test"));
  assert.ok(prompt.includes("bharatshop.marketing.video.requested"));
  assert.ok(prompt.includes("bharatshop.fashion.creative.requested"));
  assert.ok(prompt.includes("POST /api/automation/autom8ai/result"));
  assert.ok(prompt.includes("Authorization: Bearer <BHARATSHOP_AUTOMATION_TOKEN>"));
  assert.ok(prompt.includes("never changes product records"));
});
