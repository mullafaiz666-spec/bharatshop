import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every visible DashboardV2 AI persona maps to an intended specialist runtime", () => {
  const dashboard = read("src/components/DashboardV2.tsx");
  const route = read("src/app/api/ceo-chat/route.ts");
  for (const persona of [
    "AI CEO",
    "Product Research",
    "Source Verification",
    "Image & Media",
    "BharatDrip Fashion",
    "Listing & Merchandising",
    "Marketing",
    "Advertising",
    "Order Re-check",
    "Fulfilment & Tracking",
    "Learning & Analytics",
    "Automation Engineering",
    "Web & Conversion",
  ]) {
    assert.match(dashboard, new RegExp(persona.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(route.toLowerCase(), new RegExp(persona.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(route, /runtimeAgent = DASHBOARD_AGENT_MAP/);
  assert.match(route, /"bharatdrip fashion": "listing"/);
  assert.match(route, /"automation engineering": "automation"/);
  assert.match(route, /"web & conversion": "web-design"/);
});

test("dashboard chat receives stable per-browser per-agent memory sessions", () => {
  const route = read("src/app/api/ceo-chat/route.ts");
  assert.match(route, /bharatshop_agent_session/);
  assert.match(route, /crypto\.randomUUID\(\)/);
  assert.match(route, /derivedSessionId/);
  assert.match(route, /maxAge: 60 \* 60 \* 24 \* 30/);
  assert.match(route, /httpOnly: true/);
});
