import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const engine = await readFile(new URL("../src/lib/creative/engine.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/api/creative/route.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("creative engine is free-first with optional Gemini fallback", () => {
  assert.match(engine, /generateEditorialImage/);
  assert.match(engine, /geminiImage/);
  assert.match(engine, /attempts\.push\(\(\) => freeImage/);
  assert.match(engine, /requested === "auto" && googleConfigured/);
});

test("creative API protects generation and preserves capability discovery", () => {
  assert.match(route, /getAdminUser/);
  assert.match(route, /BHARATSHOP_AUTOMATION_TOKEN/);
  assert.match(route, /export async function GET/);
  assert.match(route, /if \(!\(await authorized\(req\)\)\)/);
});

test("creative CLI is wired into package scripts", () => {
  assert.equal(pkg.scripts.creative, "node scripts/bharatshop-creative.mjs");
  const run = spawnSync(process.execPath, [new URL("../scripts/bharatshop-creative.mjs", import.meta.url).pathname, "help"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /BharatShop Creative CLI/);
  assert.match(run.stdout, /npm run creative -- image/);
});
