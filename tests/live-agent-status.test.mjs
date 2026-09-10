import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public agent status endpoint exposes only sanitized readiness fields", () => {
  const src = read("src/app/api/health/agents/route.ts");
  assert.match(src, /deepAgentReadiness/);
  assert.match(src, /allOperational/);
  assert.match(src, /summary: readiness\.summary/);
  assert.match(src, /commandCentre: "\/dashboard\/command-centre"/);
  assert.doesNotMatch(src, /runtimeTools/);
  assert.doesNotMatch(src, /dependencyChecks/);
  assert.doesNotMatch(src, /process\.env\.SEARXNG_URL/);
  assert.doesNotMatch(src, /process\.env\.AI_BASE_URL/);
  assert.doesNotMatch(src, /process\.env\.DATABASE_URL/);
});

test("live visual agent status page renders the full operational matrix", () => {
  const src = read("src/app/status/agents/page.tsx");
  assert.match(src, /Live Agent Operations/);
  assert.match(src, /ALL OPERATIONAL/);
  assert.match(src, /state\.summary\.ready/);
  assert.match(src, /state\.summary\.total/);
  assert.match(src, /\/dashboard\/command-centre/);
  assert.match(src, /\/api\/health\/agents/);
});

test("digital catalog upload is not copied with insecure direct-download behavior", () => {
  let route = "";
  try { route = read("src/app/api/storefront/digital-download/route.ts"); } catch {}
  assert.equal(route, "", "production must not add the uploaded demo direct-download route without payment entitlement");
});
