import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync(new URL("../src/lib/autom8ai.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/automation/autom8ai/route.ts", import.meta.url), "utf8");
const marketing = readFileSync(new URL("../src/components/MarketingAgentCockpit.tsx", import.meta.url), "utf8");
const fashion = readFileSync(new URL("../src/components/FashionAgentCockpit.tsx", import.meta.url), "utf8");
const connections = readFileSync(new URL("../src/lib/marketing/connections.ts", import.meta.url), "utf8");
const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test("Autom8AI adapter is explicit webhook orchestration with fail-closed configuration", () => {
  assert.ok(adapter.includes("AUTOM8AI_WEBHOOK_URL"));
  assert.ok(adapter.includes("AUTOM8AI_WEBHOOK_TOKEN"));
  assert.ok(adapter.includes("bharatshop.autom8ai.v1"));
  assert.ok(adapter.includes('autoPublish: false'));
  assert.ok(adapter.includes('adSpend: false'));
  assert.ok(adapter.includes('productMutation: false'));
  assert.ok(adapter.includes('requiresHumanReview: true'));
  assert.ok(adapter.includes('path: "/api/automation/autom8ai/result"'));
  assert.ok(adapter.includes('auth: "Bearer BHARATSHOP_AUTOMATION_TOKEN"'));
  assert.ok(adapter.includes('mode: "review-only-callback"'));
  assert.ok(adapter.includes('...(token ? { Authorization: `Bearer ${token}` } : {})'));
});

test("Autom8AI marketing-video jobs require a real published profitable product", () => {
  assert.ok(route.includes('action === "marketing-video"'));
  assert.ok(route.includes('product.status !== "Published"'));
  assert.ok(route.includes('Number(product.netProfitInr) <= 0'));
  assert.ok(route.includes('workflow: "marketing-video"'));
  assert.ok(route.includes("AUTOM8AI_MARKETING_VIDEO_QUEUED"));
});

test("Autom8AI fashion jobs preserve Qikink made-to-order and original-art gates", () => {
  assert.ok(route.includes('action === "fashion-creative"'));
  assert.ok(route.includes('productionSupplier !== "qikink"'));
  assert.ok(route.includes('inventoryMode !== "MADE_TO_ORDER"'));
  assert.ok(route.includes('ipPolicy && !ipPolicy.includes("ORIGINAL")'));
  assert.ok(route.includes('workflow: "fashion-creative"'));
  assert.ok(route.includes("AUTOM8AI_FASHION_CREATIVE_QUEUED"));
});

test("Marketing and Fashion cockpits expose explicit Autom8AI actions", () => {
  assert.ok(marketing.includes("Autom8AI video"));
  assert.ok(marketing.includes('action: "marketing-video"'));
  assert.ok(fashion.includes("Autom8AI creative"));
  assert.ok(fashion.includes('action: "fashion-creative"'));
});

test("read-only marketing connection checks never trigger Autom8AI webhooks", () => {
  assert.ok(connections.includes('key:"autom8ai"'));
  assert.ok(connections.includes('channel.key === "autom8ai"'));
  assert.ok(connections.includes("Read-only verification does not trigger workflow webhooks"));
  assert.ok(env.includes("AUTOM8AI_WEBHOOK_URL="));
  assert.ok(env.includes("AUTOM8AI_WEBHOOK_TOKEN="));
  assert.ok(env.includes("Optional. Leave blank for Autom8AI generic webhooks"));
});
