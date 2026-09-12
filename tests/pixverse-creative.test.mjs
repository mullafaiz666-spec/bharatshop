import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const node = process.execPath;
const script = "scripts/pixverse-creative.mjs";

function run(args, env = {}) {
  return spawnSync(node, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PIXVERSE_ENABLED: "false",
      PIXVERSE_ALLOW_CREDIT_SPEND: "false",
      ...env,
    },
  });
}

test("PixVerse creative generation is plan-only by default", () => {
  const result = run(["create", "--type", "image", "--prompt", "BharatShop test creative"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.mode, "PLAN_ONLY");
  assert.equal(payload.enabled, false);
  assert.equal(payload.creditSpendAllowed, false);
  assert.equal(payload.type, "image");
  assert.match(payload.note, /No PixVerse generation was started/);
});

test("PixVerse billable execution is blocked while integration is disabled", () => {
  const result = run(["create", "--type", "video", "--prompt", "BharatShop test reel", "--execute"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /PIXVERSE_ENABLED=true/);
});

test("PixVerse has a second explicit credit-spend gate", () => {
  const result = run(
    ["create", "--type", "image", "--prompt", "BharatShop test image", "--execute"],
    { PIXVERSE_ENABLED: "true", PIXVERSE_ALLOW_CREDIT_SPEND: "false" },
  );
  assert.equal(result.status, 4);
  assert.match(result.stderr, /PIXVERSE_ALLOW_CREDIT_SPEND=true/);
});

test("repository keeps PixVerse optional and local-worker scoped", () => {
  const envExample = readFileSync(".env.example", "utf8");
  const gitignore = readFileSync(".gitignore", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(envExample, /PIXVERSE_ENABLED=false/);
  assert.match(envExample, /PIXVERSE_ALLOW_CREDIT_SPEND=false/);
  assert.match(gitignore, /^\.pixverse\/$/m);
  assert.equal(packageJson.scripts["pixverse:create"], "node scripts/pixverse-creative.mjs create");
  assert.equal(packageJson.dependencies?.pixverse, undefined);
});
