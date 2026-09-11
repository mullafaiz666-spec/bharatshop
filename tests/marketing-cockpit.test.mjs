import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Marketing Agent cockpit is authenticated and uses real BharatShop sources", () => {
  const page = read("src/app/dashboard/marketing/page.tsx");
  const api = read("src/app/api/marketing/cockpit/route.ts");
  const proxy = read("src/proxy.ts");
  assert.match(page, /getAdminUser/);
  assert.match(page, /MarketingAgentCockpit/);
  assert.match(api, /marketingCampaigns/);
  assert.match(api, /orders/);
  assert.match(api, /products/);
  assert.match(api, /aiActivityLogs/);
  assert.match(proxy, /"\/api\/marketing"/);
});

test("cockpit exposes operational marketing actions without silently enabling spend", () => {
  const ui = read("src/components/MarketingAgentCockpit.tsx");
  for (const tab of ["Overview", "Pipeline", "Calendar", "Performance", "Library", "Routines", "Review", "Connections", "Agent"]) assert.match(ui, new RegExp(`\\"${tab}\\"`));
  assert.match(ui, /\/api\/marketing\/launch/);
  assert.match(ui, /\/api\/marketing\/connections/);
  assert.match(ui, /\/api\/marketing\/organic-pack/);
  assert.match(ui, /\/api\/marketing\/meta\/campaigns/);
  assert.match(ui, /\/api\/agents/);
  assert.match(ui, /Create Meta PAUSED/);
  assert.match(ui, /Spend: OFF/);
  assert.doesNotMatch(ui, /status:\s*["']ACTIVE["']/);
});

test("cockpit state persists without adding or resetting production tables", () => {
  const api = read("src/app/api/marketing/cockpit/route.ts");
  const schema = read("src/db/schema.ts");
  assert.match(api, /COCKPIT_STATE/);
  assert.match(api, /metadataJson/);
  assert.doesNotMatch(api, /drop table|truncate|delete\(products\)|delete\(orders\)/i);
  assert.doesNotMatch(schema, /marketing_cockpit_state/);
});
