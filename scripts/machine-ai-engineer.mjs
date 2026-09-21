#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const runtimeDir = join(root, '.runtime', 'machine-ai-engineer');
const stateBase = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const backupDir = join(stateBase, 'EngineerBackups');
const secretQuarantineDir = join(stateBase, 'EngineerSecretsQuarantine');
const harnessScript = join(root, 'scripts', 'deepseek-harness.mjs');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const argv = process.argv.slice(2);
const statusOnly = argv.includes('--status');
const noRepairPass = argv.includes('--no-repair-pass');
const task = argv.filter(arg => !['--status', '--no-repair-pass'].includes(arg)).join(' ').trim();

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: options.env || safeChildEnv(),
    timeout: options.timeout || 20 * 60_000,
    maxBuffer: 24 * 1024 * 1024,
    stdio: options.stdio || 'pipe',
  });
}

function git(args, options = {}) {
  return run('git', args, { ...options, timeout: options.timeout || 60_000 });
}

function text(result) {
  return `${result?.stdout || ''}${result?.stderr || ''}`.trim();
}

function safeChildEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:DATABASE|POSTGRES|PGHOST|PGUSER|PGPASSWORD|SUPABASE|RAZORPAY|CASHFREE|SHOPIFY|SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?KEY)/i.test(key)) {
      delete env[key];
    }
  }
  env.CI = '1';
  env.BHARATSHOP_ENGINEERING_SANDBOX = '1';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GCM_INTERACTIVE = 'Never';
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'remote.origin.pushurl';
  env.GIT_CONFIG_VALUE_0 = 'disabled://bharatshop-machine-engineer';
  return env;
}

function secretFiles() {
  let names = [];
  try { names = readdirSync(root); } catch {}
  return names.filter(name => {
    if (name === '.env.example') return false;
    return /^\.env(?:\.|$)/i.test(name) || ['.npmrc', '.netrc'].includes(name.toLowerCase());
  });
}

function currentBranch() {
  return text(git(['branch', '--show-current'])) || 'unknown';
}

function currentHead() {
  return text(git(['rev-parse', 'HEAD'])) || 'unknown';
}

function workingTree() {
  return text(git(['status', '--porcelain']));
}

function assertPreflight() {
  const branch = currentBranch();
  if (!/^(?:repair|fix|feature|chore|test|ai)\//i.test(branch)) {
    throw new Error(`Refusing engineering mutations on branch "${branch}". Use a repair/fix/feature branch or worktree.`);
  }
  if (!existsSync(harnessScript)) throw new Error('DeepSeek Harness launcher is missing.');
  const secrets = secretFiles();
  const dirty = workingTree();
  return {
    branch,
    head: currentHead(),
    clean: !dirty,
    dirtyEntries: dirty ? dirty.split(/\r?\n/).filter(Boolean).length : 0,
    secretFiles: secrets,
    secretHandling: secrets.length ? 'QUARANTINE_DURING_ENGINEERING' : 'NONE',
  };
}

function quarantineSecretFiles(names = []) {
  if (!names.length) return [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionDir = join(secretQuarantineDir, stamp);
  mkdirSync(sessionDir, { recursive: true });
  const moved = [];
  for (const name of names) {
    const source = join(root, name);
    if (!existsSync(source)) continue;
    const destination = join(sessionDir, name);
    renameSync(source, destination);
    moved.push({ name, source, destination });
  }
  return moved;
}

function restoreSecretFiles(moved = []) {
  const restored = [];
  for (const item of [...moved].reverse()) {
    if (!existsSync(item.destination)) continue;
    if (existsSync(item.source)) {
      const conflict = `${item.destination}.generated-conflict`;
      renameSync(item.source, conflict);
    }
    renameSync(item.destination, item.source);
    restored.push(item.name);
  }
  return restored;
}

function snapshotBaseline(preflight) {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const statusPath = join(backupDir, `${stamp}.status.txt`);
  const patchPath = join(backupDir, `${stamp}.tracked.patch`);
  const status = workingTree();
  const patch = text(git(['diff', '--binary', 'HEAD'], { timeout: 60_000 }));
  writeFileSync(statusPath, `branch=${preflight.branch}\nhead=${preflight.head}\n\n${status}\n`, 'utf8');
  writeFileSync(patchPath, patch ? `${patch}\n` : '', 'utf8');
  return { statusPath, patchPath, trackedPatchBytes: Buffer.byteLength(patch || '', 'utf8') };
}

function assertPostHarness(preflight) {
  const secrets = secretFiles();
  if (secrets.length) {
    throw new Error(`Harness created a secret-bearing workspace file while original secrets were quarantined: ${secrets.join(', ')}. Verification stopped.`);
  }
  const branch = currentBranch();
  if (branch !== preflight.branch) {
    throw new Error(`Harness changed branches from "${preflight.branch}" to "${branch}". Verification stopped.`);
  }
  const head = currentHead();
  if (head !== preflight.head) {
    throw new Error('Harness created or moved a commit. Verification stopped; inspect the isolated repair branch before continuing.');
  }
}

function redact(value) {
  let s = String(value || '').replace(/\x1b\[[0-9;]*m/g, '');
  s = s.replace(/\b(?:gh[pousr]|github_pat|shpat|sk|sbp)_[A-Za-z0-9_\-]{12,}\b/g, '[REDACTED_TOKEN]');
  s = s.replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
  s = s.replace(/\b(?:[A-Za-z0-9_-]{18,}\.){2}[A-Za-z0-9_-]{18,}\b/g, '[REDACTED_JWT]');
  s = s.replace(/^.*(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL).*$/gim, '[REDACTED_SECRET_LINE]');
  return s.slice(-7000);
}

function invokeHarness(prompt) {
  const result = spawnSync(process.execPath, [harnessScript, 'task', prompt], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: safeChildEnv(),
    timeout: 45 * 60_000,
  });
  return { exitCode: result.status ?? 1, error: result.error?.message || '' };
}

const checks = [
  { name: 'git-diff-check', command: 'git', args: ['diff', '--check'], timeout: 60_000 },
  { name: 'typecheck', command: npm, args: ['run', 'typecheck'], timeout: 20 * 60_000 },
  { name: 'integration-tests', command: npm, args: ['run', 'test:integrations'], timeout: 25 * 60_000 },
  { name: 'lint', command: npm, args: ['run', 'lint'], timeout: 20 * 60_000 },
  { name: 'production-build', command: npm, args: ['run', 'build'], timeout: 30 * 60_000 },
];

function runChecks() {
  const results = [];
  for (const check of checks) {
    const started = Date.now();
    const result = run(check.command, check.args, { timeout: check.timeout });
    results.push({
      name: check.name,
      ok: result.status === 0,
      exitCode: result.status ?? 1,
      elapsedMs: Date.now() - started,
      outputTail: redact(text(result)),
    });
    if (result.error) {
      results[results.length - 1].error = redact(result.error.message);
    }
  }
  return results;
}

function makePrompt(userTask) {
  return `BHARATSHOP LOCAL ENGINEERING TASK

Work only in the current repair/fix/feature checkout. Existing local changes may already be present: preserve them and build on top of them; never reset, clean, checkout-overwrite, or discard unrelated work.

TASK:
${userTask}

REQUIRED METHOD:
1. Inspect the existing implementation and relevant tests before editing.
2. Make the smallest coherent source/test change needed.
3. You may use subagent_codex and subagent_claude_code for bounded implementation/review.
4. Do not inspect .env*, credential files, browser/session stores, or secrets.
5. Do not connect to or mutate production databases, payments, storefront publishing, deployment platforms, or customer data.
6. Do not commit, push, merge, deploy, publish, install paid services, or spend money.
7. Run targeted local tests where useful. The outer engineering controller will independently run typecheck, integration tests, lint, and production build.
8. If blocked by credentials, production-only data, or an external approval, stop and report the blocker rather than weakening protections.
9. Never claim success merely because a child agent says it succeeded; inspect repository evidence.

Leave the working-tree changes uncommitted for deterministic verification.`;
}

function repairPrompt(userTask, failures) {
  const diagnostics = failures.map(item => `### ${item.name} (exit ${item.exitCode})\n${item.outputTail}`).join('\n\n');
  return `BHARATSHOP LOCAL REPAIR PASS

The previous engineering pass for this task did not satisfy deterministic local verification.

ORIGINAL TASK:
${userTask}

FAILED CHECKS:
${diagnostics}

Repair only the failures that are supported by this evidence. Re-inspect the changed files before editing. Preserve existing safety controls. Do not inspect secrets, touch production data, commit, push, merge, deploy, or publish. Leave changes uncommitted for the outer controller to re-test.`;
}

function writeReport(payload) {
  mkdirSync(runtimeDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(runtimeDir, `${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

let quarantinedSecrets = [];
try {
  const preflight = assertPreflight();
  if (statusOnly) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'STATUS',
      preflight,
      harness: existsSync(harnessScript) ? 'PRESENT' : 'MISSING',
      safety: {
        productionWrites: false,
        deployment: false,
        commits: false,
        pushes: false,
        secretEnvironmentForwarding: false,
        secretWorkspaceFiles: preflight.secretFiles.length ? 'WILL_QUARANTINE_DURING_ENGINEERING' : 'NONE',
      },
    }, null, 2));
    process.exit(0);
  }

  if (!task) {
    console.error('Usage: npm.cmd run machine:engineer -- "fix/build task" [--no-repair-pass]');
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  quarantinedSecrets = quarantineSecretFiles(preflight.secretFiles);
  if (quarantinedSecrets.length) {
    console.log(`Secret workspace files quarantined outside repository: ${quarantinedSecrets.map(item => item.name).join(', ')}`);
  }
  const baselineBackup = snapshotBaseline(preflight);
  console.log(`BharatShop Machine Engineer starting on ${preflight.branch} @ ${preflight.head.slice(0, 12)}`);
  console.log(`Existing tracked changes backup: ${baselineBackup.patchPath}`);
  console.log('Production writes/deploy/commit/push: DISABLED');

  const first = invokeHarness(makePrompt(task));
  assertPostHarness(preflight);
  let verification = runChecks();
  let repair = null;
  let failures = verification.filter(item => !item.ok);

  if ((first.exitCode !== 0 || failures.length) && !noRepairPass) {
    console.log(`First pass needs repair: harnessExit=${first.exitCode}, failedChecks=${failures.length}`);
    repair = invokeHarness(repairPrompt(task, failures.length ? failures : [{
      name: 'harness-execution',
      exitCode: first.exitCode,
      outputTail: redact(first.error || 'Harness task exited non-zero without deterministic check failures.'),
    }]));
    assertPostHarness(preflight);
    verification = runChecks();
    failures = verification.filter(item => !item.ok);
  }

  const finalHarnessExit = repair ? repair.exitCode : first.exitCode;
  const status = finalHarnessExit === 0 && failures.length === 0 ? 'LOCAL_ENGINEERING_PASS' : 'NEEDS_REVIEW';
  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    task,
    preflight,
    baselineBackup,
    firstHarness: first,
    repairHarness: repair,
    verification,
    final: {
      branch: currentBranch(),
      head: currentHead(),
      workingTree: workingTree().split(/\r?\n/).filter(Boolean).slice(0, 200),
      failedChecks: failures.map(item => item.name),
    },
    safety: {
      productionWrites: false,
      deployment: false,
      commits: false,
      pushes: false,
      secretEnvironmentForwarding: false,
      secretWorkspaceFilesQuarantined: quarantinedSecrets.map(item => item.name),
      repairPasses: repair ? 1 : 0,
    },
  };
  const reportPath = writeReport(report);

  console.log(`\n=== BharatShop Machine Engineer ===`);
  console.log(`STATUS: ${status}`);
  console.log(`BRANCH: ${report.final.branch}`);
  console.log(`FAILED CHECKS: ${report.final.failedChecks.length ? report.final.failedChecks.join(', ') : 'none'}`);
  console.log(`REPORT: ${reportPath}`);
  console.log('Changes remain uncommitted for human review.');
  const restored = restoreSecretFiles(quarantinedSecrets);
  quarantinedSecrets = [];
  if (restored.length) console.log(`Restored protected workspace files: ${restored.join(', ')}`);
  process.exitCode = status === 'LOCAL_ENGINEERING_PASS' ? 0 : 1;
} catch (error) {
  try {
    const restored = restoreSecretFiles(quarantinedSecrets);
    quarantinedSecrets = [];
    if (restored.length) console.error(`Restored protected workspace files after failure: ${restored.join(', ')}`);
  } catch (restoreError) {
    console.error(`CRITICAL: protected workspace file restore failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
  }
  console.error(`Machine Engineer blocked: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
