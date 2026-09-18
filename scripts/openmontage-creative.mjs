#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PINNED_REPO = "https://github.com/calesthio/OpenMontage.git";
const PINNED_REVISION = "08e2151fa02de28a5d6a312b3d575692bf147ad7";
const argv = process.argv.slice(2);
const action = argv.shift() || "status";

const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value || ""));
const enabled = truthy(process.env.BHARATSHOP_OPENMONTAGE_ENABLED);
const repoUrl = process.env.OPENMONTAGE_REPO_URL || PINNED_REPO;
const revision = process.env.OPENMONTAGE_REVISION || PINNED_REVISION;
const targetPath = resolve(process.env.OPENMONTAGE_PATH || ".runtime/openmontage");
const jobsRoot = resolve(process.env.OPENMONTAGE_JOBS_PATH || ".runtime/openmontage-jobs");

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function takeFlag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`, 2);
  argv.splice(index, 2);
  return value;
}

function takeBool(name) {
  const index = argv.indexOf(name);
  if (index === -1) return false;
  argv.splice(index, 1);
  return true;
}

function assertNoUnknown() {
  if (argv.length) fail(`Unknown argument(s): ${argv.join(" ")}`, 2);
}

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: options.stdio || "pipe",
    env: process.env,
  });
}

function commandInfo(command, args = ["--version"]) {
  const result = run(command, args);
  return {
    ok: result.status === 0,
    version: result.status === 0 ? `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0] : null,
  };
}

function pythonInfo() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3", "--version"], ["-3"]], ["python", ["--version"], []]]
    : [["python3", ["--version"], []], ["python", ["--version"], []]];
  for (const [command, versionArgs, prefix] of candidates) {
    const info = commandInfo(command, versionArgs);
    if (info.ok) return { ...info, command, prefix };
  }
  return { ok: false, version: null, command: null, prefix: [] };
}

function gitValue(args, cwd = targetPath) {
  const result = run("git", args, { cwd });
  return result.status === 0 ? result.stdout.trim() : null;
}

function integrationStatus() {
  const git = commandInfo("git");
  const node = { ok: true, version: process.version };
  const ffmpeg = commandInfo("ffmpeg", ["-version"]);
  const python = pythonInfo();
  const repoPresent = existsSync(join(targetPath, ".git"));
  const requirementsPresent = existsSync(join(targetPath, "requirements.txt"));
  const remotionPresent = existsSync(join(targetPath, "remotion-composer", "package.json"));
  const venvPresent = existsSync(join(targetPath, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"));
  const remotionInstalled = existsSync(join(targetPath, "remotion-composer", "node_modules"));
  const head = repoPresent ? gitValue(["rev-parse", "HEAD"]) : null;
  const origin = repoPresent ? gitValue(["remote", "get-url", "origin"]) : null;
  const dirty = repoPresent ? Boolean(gitValue(["status", "--porcelain"])) : false;
  const pinnedRevision = head === revision;

  return {
    ok: true,
    integration: "bharatshop-openmontage-adapter-v1",
    executionMode: "LOCAL_WORKSTATION_ONLY",
    enabled,
    upstream: { repoUrl, revision, license: "AGPL-3.0" },
    paths: { targetPath, jobsRoot },
    tools: { git, node, python: { ok: python.ok, version: python.version }, ffmpeg },
    repository: { present: repoPresent, origin, head, pinnedRevision, dirty, requirementsPresent, remotionPresent },
    dependencies: { pythonVenvPresent: venvPresent, remotionNodeModulesPresent: remotionInstalled },
    readyForAgenticProduction: Boolean(
      enabled && git.ok && node.ok && python.ok && ffmpeg.ok && repoPresent && pinnedRevision && !dirty && requirementsPresent && remotionPresent && venvPresent && remotionInstalled
    ),
    note: "BharatShop does not vendor OpenMontage source. Rendering is local and provider spending remains separately gated by OpenMontage/provider configuration.",
  };
}

function safeText(value, max = 500) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function normalizedAspect(value) {
  const allowed = new Set(["9:16", "16:9", "1:1", "4:5"]);
  return allowed.has(String(value)) ? String(value) : "9:16";
}

function createPlan() {
  const title = safeText(takeFlag("--title"), 120);
  const brand = safeText(takeFlag("--brand") || "BharatShop", 80);
  const goal = safeText(takeFlag("--goal") || "short-form product launch film", 220);
  const creativeDirection = safeText(takeFlag("--creative-direction") || "premium, original, product-led, social-first", 500);
  const audience = safeText(takeFlag("--audience") || "Indian ecommerce shoppers", 180);
  const productUrl = safeText(takeFlag("--product-url"), 500);
  const referenceUrl = safeText(takeFlag("--reference-url"), 500);
  const aspectRatio = normalizedAspect(takeFlag("--aspect"));
  const requestedDuration = Number(takeFlag("--duration") || 15);
  const durationSeconds = Number.isFinite(requestedDuration) ? Math.max(5, Math.min(180, Math.round(requestedDuration))) : 15;
  assertNoUnknown();
  if (!title) fail("--title is required", 2);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campaign";
  const jobId = `${stamp}-${slug}`;
  const jobDir = join(jobsRoot, jobId);
  mkdirSync(jobDir, { recursive: true });

  const request = {
    schemaVersion: 1,
    jobId,
    createdAt: new Date().toISOString(),
    source: "bharatshop",
    engine: "openmontage",
    upstream: { repoUrl, revision, license: "AGPL-3.0" },
    constraints: {
      execution: "local-workstation-only",
      autoPublish: false,
      autoSpend: false,
      originalOrLicensedMediaOnly: true,
      preserveBharatShopApprovalGate: true,
    },
    campaign: { title, brand, goal, audience, durationSeconds, aspectRatio, creativeDirection, productUrl, referenceUrl },
  };

  const prompt = [
    `# BharatShop OpenMontage Production — ${title}`,
    "",
    `Create a ${durationSeconds}-second ${aspectRatio} ${goal} for ${brand}.`,
    `Target audience: ${audience}.`,
    `Creative direction: ${creativeDirection}.`,
    productUrl ? `Product source: ${productUrl}` : "Use only product assets explicitly supplied by the BharatShop operator.",
    referenceUrl ? `Reference inspiration: ${referenceUrl}` : "No external reference video was supplied.",
    "",
    "Requirements:",
    "- Keep the product identity and factual claims faithful to BharatShop source data.",
    "- Use only original, public-domain, or properly licensed media and music.",
    "- Do not use third-party logos, copyrighted characters, celebrity likenesses, or misleading endorsements.",
    "- Produce a hook, scene plan/storyboard, shot list, edit rhythm, captions, audio plan, and final render plan.",
    "- Prefer free/local tools when quality is sufficient; list any paid provider and estimated cost before use.",
    "- Stop at creative approval gates before billable generation and before external publishing.",
    "- Final publishing remains a BharatShop CEO/listing approval action.",
    "",
    `Pinned OpenMontage revision: ${revision}`,
  ].join("\n");

  writeFileSync(join(jobDir, "request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  writeFileSync(join(jobDir, "PROMPT.md"), `${prompt}\n`, "utf8");

  console.log(JSON.stringify({ ok: true, mode: "PLAN_ONLY", jobId, jobDir, files: [join(jobDir, "request.json"), join(jobDir, "PROMPT.md")], request }, null, 2));
}

function bootstrap() {
  const execute = takeBool("--execute");
  assertNoUnknown();
  if (!execute) {
    console.log(JSON.stringify({
      ok: true,
      mode: "PLAN_ONLY",
      enabled,
      targetPath,
      repoUrl,
      revision,
      actions: ["clone reviewed upstream into ignored .runtime workspace", "checkout pinned revision", "do not install dependencies", "do not enable paid providers"],
      note: "Re-run with --execute only on an authorized local creative workstation.",
    }, null, 2));
    return;
  }
  if (!enabled) fail("OpenMontage execution is disabled. Set BHARATSHOP_OPENMONTAGE_ENABLED=true on the authorized local workstation.", 3);
  if (!commandInfo("git").ok) fail("git is required to bootstrap OpenMontage.", 4);

  if (existsSync(targetPath)) {
    if (!existsSync(join(targetPath, ".git"))) fail(`Target exists but is not a Git repository: ${targetPath}`, 5);
    const dirty = gitValue(["status", "--porcelain"]);
    if (dirty) fail("OpenMontage checkout has local changes. Refusing to change its revision.", 6);
  } else {
    mkdirSync(resolve(targetPath, ".."), { recursive: true });
    const cloned = run("git", ["clone", "--filter=blob:none", repoUrl, targetPath], { stdio: "inherit" });
    if (cloned.status !== 0) fail("OpenMontage clone failed.", cloned.status || 7);
  }

  const fetched = run("git", ["fetch", "origin", revision], { cwd: targetPath, stdio: "inherit" });
  if (fetched.status !== 0) fail("Could not fetch the pinned OpenMontage revision.", fetched.status || 8);
  const checkedOut = run("git", ["checkout", "--detach", revision], { cwd: targetPath, stdio: "inherit" });
  if (checkedOut.status !== 0) fail("Could not checkout the pinned OpenMontage revision.", checkedOut.status || 9);
  console.log(JSON.stringify(integrationStatus(), null, 2));
}

function openBacklot() {
  const execute = takeBool("--execute");
  assertNoUnknown();
  if (!execute) {
    console.log(JSON.stringify({ ok: true, mode: "PLAN_ONLY", command: "python -m backlot open", cwd: targetPath }, null, 2));
    return;
  }
  if (!enabled) fail("OpenMontage execution is disabled. Set BHARATSHOP_OPENMONTAGE_ENABLED=true on the authorized local workstation.", 3);
  if (!existsSync(join(targetPath, ".git"))) fail("OpenMontage is not bootstrapped. Run npm run openmontage:bootstrap -- --execute first.", 4);
  const python = pythonInfo();
  if (!python.ok) fail("Python 3 is required to open Backlot.", 5);
  const result = run(python.command, [...python.prefix, "-m", "backlot", "open"], { cwd: targetPath, stdio: "inherit" });
  if (result.status !== 0) fail("OpenMontage Backlot failed to start. Install the reviewed OpenMontage dependencies first.", result.status || 6);
}

if (action === "status") {
  assertNoUnknown();
  console.log(JSON.stringify(integrationStatus(), null, 2));
} else if (action === "bootstrap") {
  bootstrap();
} else if (action === "plan") {
  createPlan();
} else if (action === "backlot") {
  openBacklot();
} else {
  fail("Usage: openmontage-creative.mjs <status|bootstrap|plan|backlot> [options]", 2);
}
