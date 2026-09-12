import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("production deploy uses a private Netlify build hook instead of broken source-upload and CLI paths", () => {
  const workflow = read(".github/workflows/netlify-production-deploy.yml");
  assert.match(workflow, /api\.netlify\.com\/api\/v1\/sites\/\$\{NETLIFY_SITE_ID\}\/build_hooks/);
  assert.match(workflow, /NETLIFY_BUILD_HOOK_TITLE: BharatShop production CI/);
  assert.match(workflow, /hook\.branch === 'main'/);
  assert.match(workflow, /::add-mask::\$hook_url/);
  assert.match(workflow, /trigger_branch=main/);
  assert.match(workflow, /sites\/\$\{NETLIFY_SITE_ID\}\/deploys\?branch=main&per_page=20/);
  assert.match(workflow, /deploy\.commit_ref === expected/);
  assert.match(workflow, /deploy\.context === 'production'/);
  assert.doesNotMatch(workflow, /netlify-cli@latest deploy/);
  assert.doesNotMatch(workflow, /\/builds\?branch=main/);
  assert.doesNotMatch(workflow, /Content-Type: application\/zip/);
});

test("deployment remains pinned to the owned BharatShop site", () => {
  const workflow = read(".github/workflows/netlify-production-deploy.yml");
  assert.match(workflow, /NETLIFY_SITE_URL: https:\/\/bharatshop-35fd\.netlify\.app/);
  assert.match(workflow, /NETLIFY_SITE_ID: 75b5c168-6679-479d-b3a6-244e393fe1b0/);
  assert.match(workflow, /Verified Netlify target/);
});

test("storefront smoke waits for a successful production deploy and exact revision", () => {
  const workflow = read(".github/workflows/netlify-storefront-smoke.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Deploy BharatShop Netlify Production/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /EXPECTED_REVISION:/);
  assert.match(workflow, /bharatshop-35fd\.netlify\.app/);
  assert.doesNotMatch(workflow, /bharatshops\.netlify\.app/);
});

test("production acceptance runs only after a successful exact Netlify deployment", () => {
  const workflow = read(".github/workflows/production-acceptance.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Deploy BharatShop Netlify Production/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /EXPECTED_REVISION:/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
});
