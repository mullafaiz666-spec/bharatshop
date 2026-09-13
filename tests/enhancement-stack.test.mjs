import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reviewed enhancement upstreams stay pinned and disabled by default", async () => {
  const manifest = JSON.parse(await text("upstreams/bharatshop-upstreams.json"));
  const expected = new Map([
    ["vercel-ai-sdk", "6c6c2210b9532a4c369615c044a16d595f3db117"],
    ["crawlee-research", "0b2ac45323d7be8d9d3d146d4873cec1cafdc095"],
    ["trigger-dev", "8b72e6c0616b1570d57f35b5e2a736791ad3c6f0"],
    ["langfuse-js", "8927c3f13a99f7e0f43e06a49a9caad56883f945"],
    ["uptime-kuma", "3afdc9ca86752587cc5a88147403194b5f83196d"],
  ]);

  for (const [id, commit] of expected) {
    const entry = manifest.upstreams.find((item) => item.id === id);
    assert.ok(entry, `${id} must be registered`);
    assert.equal(entry.commit, commit, `${id} pin changed unexpectedly`);
    assert.match(entry.productionDefault, /^disabled/, `${id} must remain opt-in in production`);
  }
});

test("enhancement bootstrap keeps services local and secret-gated", async () => {
  const script = await text("scripts/bootstrap-enhancements.ps1");
  assert.match(script, /127\.0\.0\.1:\$ResearchPort/);
  assert.match(script, /127\.0\.0\.1:\$AiPort/);
  assert.match(script, /127\.0\.0\.1:\$UptimePort/);
  assert.match(script, /RESEARCH_RUNNER_TOKEN/);
  assert.match(script, /AI_GATEWAY_TOKEN/);
  assert.match(script, /Resolve-DockerCli/);
  assert.match(script, /Docker\\Docker\\resources\\bin\\docker\.exe/);
});

test("research runner blocks private-network targets", async () => {
  const source = await text("services/research-runner/server.mjs");
  assert.match(source, /private_targets_are_blocked/);
  assert.match(source, /a === 10/);
  assert.match(source, /a === 127/);
  assert.match(source, /a === 192 && b === 168/);
  assert.match(source, /a === 172 && b >= 16 && b <= 31/);
  assert.match(source, /x\.startsWith\("fc"\)/);
  assert.match(source, /maxPages = Math\.max\(1, Math\.min\(20/);
});

test("research runner pins a published stable Crawlee release", async () => {
  const pkg = JSON.parse(await text("services/research-runner/package.json"));
  assert.equal(pkg.dependencies.crawlee, "3.18.1");
  assert.doesNotMatch(pkg.dependencies.crawlee, /beta|rc/i);
});

test("root scripts expose enhancement lifecycle without changing root dependencies", async () => {
  const pkg = JSON.parse(await text("package.json"));
  assert.ok(pkg.scripts["enhancements:bootstrap"]);
  assert.ok(pkg.scripts["enhancements:status"]);
  assert.ok(pkg.scripts["enhancements:stop"]);
  assert.equal(pkg.dependencies.crawlee, undefined);
  assert.equal(pkg.dependencies.ai, undefined);
});
