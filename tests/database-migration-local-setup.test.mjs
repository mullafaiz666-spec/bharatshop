import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ps = readFileSync(new URL("../scripts/configure-database-migration.ps1", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../scripts/database-migration-preflight-local.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("migration configurator hides source and target credentials", () => {
  assert.ok(ps.includes("Read-Host $Prompt -AsSecureString"));
  assert.ok(ps.includes("Secret values: [HIDDEN]"));
  assert.ok(ps.includes("SOURCE_DATABASE_URL=$source"));
  assert.ok(ps.includes("SUPABASE_DB_URL=$target"));
  assert.doesNotMatch(ps, /Write-Host\s+\$source/);
  assert.doesNotMatch(ps, /Write-Host\s+\$target/);
});

test("migration local preflight loads ignored env then invokes existing read-only preflight", () => {
  assert.ok(wrapper.includes('resolve(process.cwd(), ".env.local")'));
  assert.ok(wrapper.includes('await import("./database-migration-preflight.mjs")'));
  assert.ok(wrapper.includes("mutatesSource: false"));
  assert.ok(wrapper.includes("mutatesTarget: false"));
  assert.ok(wrapper.includes("secretValuesPrinted: false"));
});

test("package exposes guarded local migration setup and preflight", () => {
  assert.equal(pkg.scripts["db:migration:configure:windows"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-database-migration.ps1");
  assert.equal(pkg.scripts["db:migration:preflight:local"], "node scripts/database-migration-preflight-local.mjs");
});
