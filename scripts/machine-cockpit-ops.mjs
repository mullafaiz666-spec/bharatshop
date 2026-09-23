#!/usr/bin/env node

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const selfScript = fileURLToPath(import.meta.url);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const machineManager = join(root, 'scripts', 'machine-ai-manager.mjs');
const agencyManager = join(root, 'scripts', 'agency-24x7-manager.mjs');
const engineerScript = join(root, 'scripts', 'machine-ai-engineer.mjs');
const localDbHealth = join(root, 'scripts', 'local-db-health.mjs');
const storefrontManager = join(root, 'scripts', 'local-storefront-manager.mjs');
const baseState = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const opsHome = join(baseState, 'CockpitOps');
const jobsDir = join(opsHome, 'jobs');
const logsDir = join(opsHome, 'logs');
mkdirSync(jobsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

const ACTIONS = Object.freeze({
  'machine-status': { label: 'Machine AI status', kind: 'sync', approval: false, command: process.execPath, args: [machineManager, 'status'] },
  'machine-start': { label: 'Start Machine AI', kind: 'sync', approval: false, command: process.execPath, args: [machineManager, 'start'] },
  'machine-stop': { label: 'Stop Machine AI', kind: 'sync', approval: false, command: process.execPath, args: [machineManager, 'stop'] },
  'agency-status': { label: 'Agency status', kind: 'sync', approval: false, command: process.execPath, args: [agencyManager, 'status'] },
  'agency-start': { label: 'Start Agency', kind: 'sync', approval: false, command: process.execPath, args: [agencyManager, 'start'] },
  'agency-stop': { label: 'Stop Agency', kind: 'sync', approval: false, command: process.execPath, args: [agencyManager, 'stop'] },
  'engineer-status': { label: 'Machine Engineer status', kind: 'sync', approval: false, command: process.execPath, args: [engineerScript, '--status'] },
  'db-local-status': { label: 'Local database status', kind: 'sync', approval: false, command: process.execPath, args: [localDbHealth] },
  'storefront-status': { label: 'Local storefront status', kind: 'sync', approval: false, command: process.execPath, args: [storefrontManager, 'status'] },
  'storefront-start': { label: 'Start local storefront', kind: 'sync', approval: false, command: process.execPath, args: [storefrontManager, 'start'] },
  'storefront-stop': { label: 'Stop local storefront', kind: 'sync', approval: false, command: process.execPath, args: [storefrontManager, 'stop'] },
  'storefront-smoke': { label: 'Smoke-check local storefront', kind: 'sync', approval: false, command: process.execPath, args: [storefrontManager, 'smoke'] },
  'verify-local': { label: 'Run local verification', kind: 'verify', approval: false },
  'engineer-task': { label: 'Run Machine Engineer task', kind: 'engineer', approval: false },
});

function safeChildEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:DATABASE|POSTGRES|PGHOST|PGUSER|PGPASSWORD|SUPABASE|RAZORPAY|CASHFREE|SHOPIFY|SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?KEY)/i.test(key)) delete env[key];
  }
  env.CI = '1';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GCM_INTERACTIVE = 'Never';
  return env;
}

function redact(value) {
  let s = String(value || '').replace(/\x1b\[[0-9;]*m/g, '');
  s = s.replace(/\b(?:gh[pousr]|github_pat|shpat|sk|sbp)_[A-Za-z0-9_\-]{12,}\b/g, '[REDACTED_TOKEN]');
  s = s.replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
  s = s.replace(/^.*(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL).*$/gim, '[REDACTED_SECRET_LINE]');
  return s.slice(-12000);
}

function jobPath(id) { return join(jobsDir, `${id}.json`); }
function logPath(id) { return join(logsDir, `${id}.log`); }

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function writeJob(job) {
  writeFileSync(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`, 'utf8');
  return job;
}

function updateJob(id, patch) {
  const current = readJson(jobPath(id)) || { id };
  return writeJob({ ...current, ...patch, updatedAt: new Date().toISOString() });
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

function listJobs(limit = 12) {
  try {
    return readdirSync(jobsDir)
      .filter(name => name.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit)
      .map(name => readJson(join(jobsDir, name)))
      .filter(Boolean)
      .map(job => {
        let normalized = job;
        if (job.status === 'RUNNING' && job.pid && !pidAlive(job.pid)) normalized = { ...job, status: 'STALE' };
        let logTail = '';
        try { logTail = redact(readFileSync(logPath(job.id), 'utf8')).slice(-6000); } catch {}
        return { ...normalized, logTail };
      });
  } catch {
    return [];
  }
}

function runSync(command, args, { safeEnv = false, timeout = 30_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: safeEnv ? safeChildEnv() : process.env,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    output: redact(`${result.stdout || ''}${result.stderr || ''}`),
    error: result.error ? redact(result.error.message) : '',
  };
}

function hasActiveJob(kind) {
  return listJobs(30).some(job => job.kind === kind && job.status === 'RUNNING' && pidAlive(job.pid));
}

function startWorker(kind, task = '') {
  if (hasActiveJob(kind)) throw new Error(`A ${kind} job is already running.`);
  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();
  writeJob({ id, kind, task: task.slice(0, 2000), status: 'QUEUED', createdAt, updatedAt: createdAt });
  const encodedTask = Buffer.from(task, 'utf8').toString('base64url');
  const child = spawn(process.execPath, [selfScript, '--worker', kind, id, encodedTask], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: safeChildEnv(),
  });
  child.unref();
  updateJob(id, { pid: child.pid, status: 'RUNNING' });
  return readJson(jobPath(id));
}

function appendLog(id, line) {
  appendFileSync(logPath(id), `${line}\n`, 'utf8');
}

function workerVerify(id) {
  const checks = [
    { name: 'git-diff-check', command: 'git', args: ['diff', '--check'], timeout: 60_000 },
    { name: 'typecheck', command: npm, args: ['run', 'typecheck'], timeout: 20 * 60_000 },
    { name: 'integration-tests', command: npm, args: ['run', 'test:integrations'], timeout: 25 * 60_000 },
    { name: 'lint', command: npm, args: ['run', 'lint'], timeout: 20 * 60_000 },
    { name: 'production-build', command: npm, args: ['run', 'build'], timeout: 30 * 60_000 },
  ];
  const results = [];
  for (const check of checks) {
    updateJob(id, { status: 'RUNNING', currentStep: check.name, results });
    appendLog(id, `=== ${check.name} ===`);
    const fd = openSync(logPath(id), 'a');
    const result = spawnSync(check.command, check.args, {
      cwd: root,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
      env: safeChildEnv(),
      timeout: check.timeout,
    });
    closeSync(fd);
    results.push({ name: check.name, ok: result.status === 0, exitCode: result.status ?? 1, error: result.error ? redact(result.error.message) : '' });
    if (result.status !== 0) break;
  }
  const ok = results.length === checks.length && results.every(item => item.ok);
  updateJob(id, { status: ok ? 'PASS' : 'FAIL', currentStep: null, finishedAt: new Date().toISOString(), results });
  return ok ? 0 : 1;
}

function workerEngineer(id, task) {
  if (!task.trim()) {
    updateJob(id, { status: 'FAIL', finishedAt: new Date().toISOString(), error: 'Engineering task is empty.' });
    return 2;
  }
  appendLog(id, '=== BharatShop Machine Engineer ===');
  const fd = openSync(logPath(id), 'a');
  const result = spawnSync(process.execPath, [engineerScript, task], {
    cwd: root,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    env: safeChildEnv(),
    timeout: 60 * 60_000,
  });
  closeSync(fd);
  const ok = result.status === 0;
  updateJob(id, {
    status: ok ? 'PASS' : 'FAIL',
    finishedAt: new Date().toISOString(),
    exitCode: result.status ?? 1,
    error: result.error ? redact(result.error.message) : '',
  });
  return ok ? 0 : 1;
}

function workerMain(kind, id, encodedTask) {
  const task = encodedTask ? Buffer.from(encodedTask, 'base64url').toString('utf8') : '';
  updateJob(id, { pid: process.pid, status: 'RUNNING', startedAt: new Date().toISOString() });
  try {
    const code = kind === 'verify' ? workerVerify(id) : kind === 'engineer' ? workerEngineer(id, task) : 2;
    process.exitCode = code;
  } catch (error) {
    updateJob(id, { status: 'FAIL', finishedAt: new Date().toISOString(), error: redact(error instanceof Error ? error.message : String(error)) });
    process.exitCode = 1;
  }
}

export function operationCatalog() {
  return Object.entries(ACTIONS).map(([id, action]) => ({
    id,
    label: action.label,
    kind: action.kind,
    approvalRequired: action.approval,
  }));
}

export function operationsSnapshot() {
  return {
    actions: operationCatalog(),
    jobs: listJobs(),
    authority: {
      localProjectAutonomy: true,
      codeEdits: true,
      buildsAndTests: true,
      localServiceControl: true,
    },
    safety: {
      arbitraryShell: false,
      destructiveProductionDatabaseWrites: false,
      credentialExposure: false,
      payments: false,
      publishing: false,
      deploy: false,
    },
  };
}

export async function runCockpitOperation(actionId, body = {}) {
  const action = ACTIONS[String(actionId || '')];
  if (!action) throw new Error('Unsupported cockpit operation.');
  if (action.approval && body.approved !== true) throw new Error('Explicit local approval is required for this operation.');

  if (action.kind === 'sync') {
    return {
      action: actionId,
      ...runSync(action.command, action.args, { safeEnv: actionId === 'engineer-status', timeout: 45_000 }),
    };
  }
  if (action.kind === 'verify') return { action: actionId, job: startWorker('verify') };
  if (action.kind === 'engineer') {
    const task = String(body.task || '').trim();
    if (!task) throw new Error('Engineering task is required.');
    if (task.length > 20_000) throw new Error('Engineering task is too long.');
    return { action: actionId, job: startWorker('engineer', task) };
  }
  throw new Error('Unsupported cockpit operation kind.');
}

const invoked = process.argv[1] && resolve(process.argv[1]) === selfScript;
if (invoked && process.argv[2] === '--worker') {
  workerMain(String(process.argv[3] || ''), String(process.argv[4] || ''), String(process.argv[5] || ''));
}
