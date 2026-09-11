import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("public origin prefers host-independent and Netlify runtime variables", () => {
  const source = fs.readFileSync(new URL("../src/lib/public-origin.ts", import.meta.url), "utf8");
  assert.match(source, /BHARATSHOP_PUBLIC_ORIGIN/);
  assert.match(source, /process\.env\.URL/);
  assert.match(source, /DEPLOY_PRIME_URL/);
  assert.match(source, /RENDER_EXTERNAL_URL/);
});

test("production acceptance can target the approved host without code changes", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/production-acceptance.yml", import.meta.url), "utf8");
  assert.match(workflow, /vars\.BHARATSHOP_PRODUCTION_URL/);
  assert.match(workflow, /Wait for exact production deployment/);
  assert.doesNotMatch(workflow, /Wait for exact Render deployment/);
});
