import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(process.cwd());
const script = join(repoRoot, "scripts", "openmontage-creative.mjs");
const pinnedRevision = "08e2151fa02de28a5d6a312b3d575692bf147ad7";

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, BHARATSHOP_OPENMONTAGE_ENABLED: "false", ...extraEnv },
  });
}

test("OpenMontage status is non-destructive and pinned", () => {
  const result = run(["status"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.executionMode, "LOCAL_WORKSTATION_ONLY");
  assert.equal(payload.upstream.revision, pinnedRevision);
  assert.equal(payload.upstream.license, "AGPL-3.0");
  assert.equal(payload.enabled, false);
});

test("OpenMontage bootstrap defaults to plan-only", () => {
  const result = run(["bootstrap"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.mode, "PLAN_ONLY");
  assert.equal(payload.revision, pinnedRevision);
});

test("OpenMontage plan writes an approval-gated local handoff", () => {
  const root = mkdtempSync(join(tmpdir(), "bharatshop-openmontage-"));
  try {
    const result = run([
      "plan",
      "--title", "Afterdark Signal Tee",
      "--brand", "BharatDrip",
      "--goal", "15-second vertical launch film",
      "--duration", "15",
      "--aspect", "9:16",
    ], { OPENMONTAGE_JOBS_PATH: root });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.mode, "PLAN_ONLY");
    assert.equal(payload.request.constraints.autoPublish, false);
    assert.equal(payload.request.constraints.autoSpend, false);
    assert.equal(payload.request.upstream.revision, pinnedRevision);

    const request = JSON.parse(readFileSync(join(payload.jobDir, "request.json"), "utf8"));
    const prompt = readFileSync(join(payload.jobDir, "PROMPT.md"), "utf8");
    assert.equal(request.campaign.brand, "BharatDrip");
    assert.match(prompt, /Stop at creative approval gates/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hosted OpenMontage API contains no child-process execution", () => {
  const api = readFileSync(join(repoRoot, "src", "app", "api", "admin", "creative", "openmontage", "route.ts"), "utf8");
  assert.doesNotMatch(api, /child_process|spawn\(|exec\(/);
  assert.match(api, /LOCAL_WORKSTATION_REQUIRED/);
});
