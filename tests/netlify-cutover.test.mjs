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

test("production acceptance is pinned to the approved Netlify production host", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/production-acceptance.yml", import.meta.url), "utf8");
  assert.match(workflow, /https:\/\/bharatshop-35fd\.netlify\.app/);
  assert.match(workflow, /Wait for exact production deployment/);
  assert.doesNotMatch(workflow, /vars\.BHARATSHOP_PRODUCTION_URL/);
  assert.doesNotMatch(workflow, /bharatshop-9w4a\.onrender\.com/);
  assert.doesNotMatch(workflow, /Wait for exact Render deployment/);
});
