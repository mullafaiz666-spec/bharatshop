import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/autom8ai-candidates.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Autom8AI candidate preflight is read-only and credit-free", () => {
  assert.ok(source.includes('BEGIN READ ONLY'));
  assert.ok(source.includes('ROLLBACK'));
  assert.ok(source.includes('sendsAutom8Webhook: false'));
  assert.ok(source.includes('startsRenderer: false'));
  assert.ok(source.includes('consumesCredits: false'));
  assert.ok(source.includes('mutatesDatabase: false'));
  assert.doesNotMatch(source, /\bINSERT\b/i);
  assert.doesNotMatch(source, /\bUPDATE\b/i);
  assert.doesNotMatch(source, /\bDELETE\b/i);
});

test("Autom8AI candidate preflight mirrors key marketing and fashion gates", () => {
  assert.ok(source.includes("status = 'Published'"));
  assert.ok(source.includes("LOWER(p.brand) IN ('bharatdrip', 'bharatshop studio')"));
  assert.ok(source.includes("LOWER(p.supplier_name) = 'qikink'"));
  assert.ok(source.includes("custom_margin_pct::numeric >= 18"));
  assert.ok(source.includes("LIKE '%ORIGINAL%'"));
});

test("package exposes the Autom8AI candidate preflight command", () => {
  assert.equal(pkg.scripts["autom8ai:candidates"], "node scripts/autom8ai-candidates.mjs");
});
