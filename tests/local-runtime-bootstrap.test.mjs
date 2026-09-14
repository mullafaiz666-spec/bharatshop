import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("local runtime bootstrap is isolated from production and wires required local services", () => {
  const bootstrap = read("scripts/bootstrap-local-runtime.ps1");
  assert.match(bootstrap, /does not modify the production database/);
  assert.match(bootstrap, /PgPort = 55432/);
  assert.match(bootstrap, /SearxPort = 8888/);
  assert.match(bootstrap, /ShimPort = 11555/);
  assert.match(bootstrap, /Set-EnvValue "DATABASE_URL"/);
  assert.match(bootstrap, /Set-EnvValue "AI_BASE_URL"/);
  assert.match(bootstrap, /Set-EnvValue "SEARXNG_URL"/);
  assert.match(bootstrap, /Set-EnvValue "BHARATSHOP_AUTOMATION_TOKEN"/);
  assert.doesNotMatch(bootstrap, /SOURCE_DATABASE_URL/);
  assert.doesNotMatch(bootstrap, /ALLOW_REMOTE_DB_PUSH/);
});

test("local Ollama shim disables Qwen thinking without changing non-Qwen requests", () => {
  const shim = read("services/ollama-qwen-shim/server.mjs");
  assert.match(shim, /\/\^qwen\/i\.test\(model\)/);
  assert.match(shim, /parsed\.think === undefined/);
  assert.match(shim, /parsed\.think = false/);
  assert.match(shim, /127\.0\.0\.1:11434/);
});
