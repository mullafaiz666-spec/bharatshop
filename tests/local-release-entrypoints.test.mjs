import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(script, args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8", timeout: 10000,
    env: { ...process.env, ...env },
  });
}

test("production launcher reaches Next CLI without shell expansion", () => {
  const result = run("scripts/start-production.mjs", ["--help"], { PORT: "3017" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /next start/);
});

test("production launcher rejects invalid ports before starting a server", () => {
  for (const PORT of ["0", "65536", "invalid", "3000; echo unintended"]) {
    const result = run("scripts/start-production.mjs", [], { PORT });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PORT must be an integer/);
  }
});

test("acceptance cannot silently run against the production database", () => {
  const result = run("scripts/production-acceptance-v3.mjs", [], { BHARATSHOP_URL: "", BASE_URL: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no default production target/);
});

test("acceptance rejects credentials and non-origin targets without logging their values", () => {
  for (const target of ["not-a-url", "ftp://example.com", "https://user:private-value@example.com", "https://example.com?secret=private-value", "https://example.com/path"]) {
    const result = run("scripts/production-acceptance-v3.mjs", [], { BHARATSHOP_URL: target });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BHARATSHOP_URL must/);
    assert.doesNotMatch(result.stderr, /private-value/);
  }
});
