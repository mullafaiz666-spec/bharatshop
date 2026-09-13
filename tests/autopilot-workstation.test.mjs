import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync(new URL("../scripts/run-company-autopilot.ps1", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const rootPage = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const signal = fs.readFileSync(new URL("../src/components/storefront/StorefrontAgentSignal.tsx", import.meta.url), "utf8");

test("local autopilot worker queues bounded company work and processes one item at a time", () => {
  assert.match(worker, /\/api\/automation\/free-stack-schedule/);
  assert.match(worker, /\/api\/automation\/company-cycle\?limit=1/);
  assert.match(worker, /Mode = "Loop"/);
  assert.match(worker, /Press Ctrl\+C to stop the worker/);
  assert.doesNotMatch(worker, /Get-Process\s+node\s*\|\s*Stop-Process/i);
});

test("local autopilot creates a private token without printing its value", () => {
  assert.match(worker, /BHARATSHOP_AUTOMATION_TOKEN/);
  assert.match(worker, /RandomNumberGenerator/);
  assert.match(worker, /value not printed/i);
  assert.doesNotMatch(worker, /Write-Host\s+["']?\$token(?:\b|["'])/i);
  assert.doesNotMatch(worker, /Write-Host[^\n]*(?:TOKEN|SECRET)[^\n]*[:=]\s*\$token\b/i);
});

test("package scripts expose loop, one-shot and status modes", () => {
  assert.match(packageJson.scripts["agents:work"], /run-company-autopilot\.ps1 -Mode Loop/);
  assert.match(packageJson.scripts["agents:once"], /run-company-autopilot\.ps1 -Mode Once/);
  assert.match(packageJson.scripts["agents:status"], /run-company-autopilot\.ps1 -Mode Status/);
});

test("storefront surfaces only sanitized public agent readiness", () => {
  assert.match(rootPage, /StorefrontAgentSignal/);
  assert.match(signal, /\/api\/health\/agents/);
  assert.match(signal, /customer-safe controls/);
  assert.match(signal, /payments, supplier purchases and other consequential actions stay approval-gated/);
  assert.doesNotMatch(signal, /AUTOMATION_TOKEN|DATABASE_URL|GEMINI_API_KEY|SERVICE_ROLE/i);
});
