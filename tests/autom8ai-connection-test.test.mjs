import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/autom8ai-connection-test.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Autom8AI connection test is explicit dry-run and does not print webhook URL", () => {
  assert.ok(source.includes('event: "bharatshop.connection.test"'));
  assert.ok(source.includes("dryRun: true"));
  assert.ok(source.includes("autoPublish: false"));
  assert.ok(source.includes("adSpend: false"));
  assert.ok(source.includes("productMutation: false"));
  assert.ok(source.includes("createsOrders: false"));
  assert.ok(source.includes("createsPayments: false"));
  assert.ok(source.includes("createsApprovals: false"));
  assert.ok(source.includes("mutatesDatabase: false"));
  assert.ok(source.includes("deploys: false"));
  assert.ok(source.includes("webhookHost: url.hostname"));
  assert.doesNotMatch(source, /console\.log\([^\n]*rawUrl/);
});

test("package exposes the safe Autom8AI connection test", () => {
  assert.equal(pkg.scripts["autom8ai:test:connection"], "node scripts/autom8ai-connection-test.mjs");
});
