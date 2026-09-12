import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("production deploy safely fails over across existing Netlify credentials", () => {
  const workflow = read(".github/workflows/netlify-production-deploy.yml");
  assert.match(workflow, /NETLIFY_AUTH_TOKEN: \$\{\{ secrets\.NETLIFY_AUTH_TOKEN \}\}/);
  assert.match(workflow, /NETLIFY_PERSONAL_ACCESS_TOKEN: \$\{\{ secrets\.NETLIFY_PERSONAL_ACCESS_TOKEN \}\}/);
  assert.match(workflow, /NETLIFY_TOKEN: \$\{\{ secrets\.NETLIFY_TOKEN \}\}/);
  assert.match(workflow, /NETLIFY_PERSONAL_ACCESS_TOKEN:-/);
  assert.match(workflow, /NETLIFY_TOKEN:-/);
  assert.match(workflow, /NETLIFY_AUTH_TOKEN:-/);
  assert.match(workflow, /-X POST/);
  assert.match(workflow, /sites\/\$\{NETLIFY_SITE_ID\}\/builds/);
  assert.match(workflow, /NETLIFY_READ_TOKEN=\$candidate/);
  assert.match(workflow, /::add-mask::\$candidate/);
  assert.match(workflow, /No configured Netlify credential can trigger a production build/);
  assert.match(workflow, /sites\/\$\{NETLIFY_SITE_ID\}\/deploys\?branch=main&per_page=30/);
  assert.match(workflow, /deploy\.commit_ref === expected/);
  assert.match(workflow, /deploy\.context === 'production'/);
  assert.doesNotMatch(workflow, /CHATGPT_NETLIFY_DEPLOY_PROXY/);
  assert.doesNotMatch(workflow, /netlify-mcp\.netlify\.app\/proxy\//);
  assert.doesNotMatch(workflow, /netlify-cli@27\.5\.2 deploy/);
  assert.doesNotMatch(workflow, /--auth "\$candidate"/);
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
