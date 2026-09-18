import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manager = readFileSync(new URL("../scripts/local-workstation-manager.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("one-command workstation manager starts the three local runtimes quietly", () => {
  assert.ok(manager.includes('windowsHide: true'));
  assert.ok(manager.includes('BHARATSHOP_LOCAL_APP_PORT: process.env.BHARATSHOP_LOCAL_APP_PORT || "3001"'));
  assert.ok(manager.includes('BHARATSHOP_MACHINE_UI_PORT: process.env.BHARATSHOP_MACHINE_UI_PORT || "3002"'));
  assert.ok(manager.includes('run("Machine AI supervisor"'));
  assert.ok(manager.includes('run("Machine AI web UI"'));
  assert.ok(manager.includes('run("BharatShop storefront"'));
});

test("package scripts expose start, status, and stop for the full workstation", () => {
  assert.equal(pkg.scripts["local:workstation:start"], "node scripts/local-workstation-manager.mjs start");
  assert.equal(pkg.scripts["local:workstation:status"], "node scripts/local-workstation-manager.mjs status");
  assert.equal(pkg.scripts["local:workstation:stop"], "node scripts/local-workstation-manager.mjs stop");
});
