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
  assert.ok(source.includes('existing-bharatshop-harness-env'));
  assert.ok(source.includes('secretValuesPrinted: false'));
  assert.ok(source.includes('parseDotEnv(readFileSync(file))'));
  assert.ok(source.includes('existing-bharatshop-dev-db-container-env'));
  assert.ok(source.includes('"docker"'));
  assert.ok(source.includes('["inspect", "-f", "{{json .Config.Env}}", "bharatshop-dev-db"]'));
  assert.ok(source.includes('changedDatabasePassword: false'));
  assert.ok(source.includes('persistedSecretChanges: false'));
  assert.doesNotMatch(source, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(source, /\bUPDATE\s+[A-Za-z0-9_."]+\s+SET\b/i);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(source, /console\.(log|error).*rawDatabaseUrl/);
  assert.doesNotMatch(source, /POSTGRES_PASSWORD[^\n]*console/i);
});

test("Autom8AI candidate preflight mirrors key marketing and fashion gates", () => {
  assert.ok(source.includes("status = 'Published'"));
  assert.ok(source.includes("LOWER(p.brand) IN ('bharatdrip', 'bharatshop studio')"));
  assert.ok(source.includes("LOWER(p.supplier_name) = 'qikink'"));
  assert.ok(source.includes("custom_margin_pct::numeric >= 18"));
  assert.ok(source.includes("LIKE '%ORIGINAL%'"));
  assert.ok(source.includes("eligibilityDiagnostics"));
  assert.ok(source.includes("marketingFailureCounts"));
  assert.ok(source.includes("fashionFailureCounts"));
  assert.ok(source.includes("marketingNearMatches"));
  assert.ok(source.includes("fashionNearMatches"));
  assert.ok(source.includes("NOT_PUBLISHED"));
  assert.ok(source.includes("NON_POSITIVE_PROFIT"));
  assert.ok(source.includes("MARGIN_BELOW_18"));
  assert.ok(source.includes("PRODUCTION_SUPPLIER_NOT_QIKINK"));
  assert.ok(source.includes("NOT_MADE_TO_ORDER"));
  assert.ok(source.includes("ORIGINAL_ART_POLICY_MISSING"));
});

test("package exposes the Autom8AI candidate preflight command", () => {
  assert.equal(pkg.scripts["autom8ai:candidates"], "node scripts/autom8ai-candidates.mjs");
});
