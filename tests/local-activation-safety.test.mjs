import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const configure = readFileSync(new URL("../scripts/configure-autom8ai.ps1", import.meta.url), "utf8");
const verify = readFileSync(new URL("../scripts/local-readonly-verify.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Autom8AI Windows configurator keeps secrets out of command-line output and writes only .env.local", () => {
  assert.ok(configure.includes('Read-Host "Autom8AI webhook token" -AsSecureString'));
  assert.ok(configure.includes('".env.local"'));
  assert.ok(configure.includes("Token: configured (hidden)"));
  assert.doesNotMatch(configure, /Write-Host\s+\$token/);
  assert.ok(configure.includes("Webhook URL must use HTTPS unless it targets localhost."));
});

test("read-only verifier checks the canonical local BharatShop runtime without mutations", () => {
  assert.ok(verify.includes("http://127.0.0.1:3001/"));
  assert.ok(verify.includes("http://127.0.0.1:3001/bharatdrip"));
  assert.ok(verify.includes("http://127.0.0.1:3001/dashboard/fashion"));
  assert.ok(verify.includes("http://127.0.0.1:3002/"));
  assert.ok(verify.includes("http://127.0.0.1:11434/api/tags"));
  assert.ok(verify.includes("http://127.0.0.1:11555/health"));
  assert.ok(verify.includes("sendsAutom8Webhook: false"));
  assert.ok(verify.includes("mutatesDatabase: false"));
});

test("package scripts expose one-command configuration and read-only verification", () => {
  assert.equal(pkg.scripts["autom8ai:configure:windows"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-autom8ai.ps1");
  assert.equal(pkg.scripts["local:verify:readonly"], "node scripts/local-readonly-verify.mjs");
});
