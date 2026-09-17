#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BRANCH = process.env.MACHINE_AI_DEV_BRANCH || 'feature/machine-ai-operational-control';
const PREVIEW = process.env.BHARATSHOP_CONTROL_ORIGIN || 'https://preview--nimble-bharatshop-control.apper.so';
const STATE_HOME = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const WEB_PID = join(STATE_HOME, 'machine-web.pid');
const WEB_STDOUT = join(STATE_HOME, 'machine-web.stdout.log');
const WEB_STDERR = join(STATE_HOME, 'machine-web.stderr.log');
const DEPLOY_STATE = join(STATE_HOME, 'control-center-deploy.json');
const DEPLOY_SCRIPT = join(ROOT, 'scripts', 'deploy-operational-control-center.mjs');
const MANAGER = join(ROOT, 'scripts', 'machine-ai-manager.mjs');
const NEXT_BIN = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
const STARTUP_DIR = process.platform === 'win32'
  ? join(process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  : '';
const STARTUP_FILE = process.platform === 'win32' ? join(STARTUP_DIR, 'BharatShop-Machine-AI-Operational.cmd') : '';

mkdirSync(STATE_HOME, { recursive: true });

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

async function run(command, args = [], timeout = 10 * 60_000) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: ROOT,
    env: process.env,
    timeout,
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
  });
  return { stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() };
}

async function git(...args) {
  return run('git', args, 5 * 60_000);
}

function readPid(path) {
  try { return Number(readFileSync(path, 'utf8').trim()) || 0; } catch { return 0; }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function killPidTree(pid) {
  if (!pidAlive(pid)) return;
  if (process.platform === 'win32') {
    try { await run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], 30_000); } catch {}
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
  }
}

async function statusJson() {
  try {
    const response = await fetch('http://127.0.0.1:3001/api/machine-ai/status', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function waitForHealthyWeb(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await statusJson();
    if (status?.ollamaReady && status?.modelInstalled) return status;
    await sleep(1000);
  }
  return null;
}

async function syncBranch() {
  const branch = (await git('branch', '--show-current')).stdout;
  if (branch !== BRANCH) throw new Error(`Wrong branch: ${branch || '(detached)'}. Expected ${BRANCH}.`);

  const dirty = (await git('status', '--porcelain')).stdout;
  if (dirty) throw new Error(`Working tree is not clean. Commit/stash changes before automation:\n${dirty}`);

  console.log(`Syncing ${BRANCH}...`);
  await git('fetch', 'origin', BRANCH);
  await git('pull', '--ff-only', 'origin', BRANCH);
}

async function ensureSupervisor() {
  await run(process.execPath, [MANAGER, 'start'], 30_000);
}

async function ensureWeb() {
  let status = await statusJson();
  if (status?.ollamaReady && status?.modelInstalled) return status;

  const recordedPid = readPid(WEB_PID);
  if (recordedPid) {
    await killPidTree(recordedPid);
    rmSync(WEB_PID, { force: true });
    await sleep(1000);
  }

  if (!existsSync(NEXT_BIN)) {
    throw new Error('Next.js runtime is missing. Run npm install once, then retry.');
  }

  const stdoutFd = openSync(WEB_STDOUT, 'a');
  const stderrFd = openSync(WEB_STDERR, 'a');
  const child = spawn(process.execPath, [NEXT_BIN, 'dev', '-H', '127.0.0.1', '-p', '3001'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  closeSync(stdoutFd);
  closeSync(stderrFd);
  writeFileSync(WEB_PID, String(child.pid), 'utf8');

  status = await waitForHealthyWeb();
  if (!status) {
    const stderrTail = (() => {
      try { return readFileSync(WEB_STDERR, 'utf8').split(/\r?\n/).slice(-30).join('\n'); } catch { return ''; }
    })();
    throw new Error(`Machine AI web runtime did not become healthy.${stderrTail ? `\n${stderrTail}` : ''}`);
  }
  return status;
}

function deploySourceHash() {
  if (!existsSync(DEPLOY_SCRIPT)) return '';
  return createHash('sha256').update(readFileSync(DEPLOY_SCRIPT)).digest('hex');
}

function readDeployState() {
  try { return JSON.parse(readFileSync(DEPLOY_STATE, 'utf8')); } catch { return {}; }
}

async function deployIfNeeded(force = false) {
  const hash = deploySourceHash();
  const previous = readDeployState();
  if (!force && hash && previous.sourceHash === hash) {
    console.log('Control Center source unchanged; deploy skipped.');
    return { skipped: true };
  }

  console.log('Deploying operational Control Center...');
  try {
    const result = await run(process.execPath, [DEPLOY_SCRIPT], 20 * 60_000);
    if (result.stdout) console.log(result.stdout);
    if (hash) {
      writeFileSync(DEPLOY_STATE, JSON.stringify({ sourceHash: hash, deployedAt: new Date().toISOString() }, null, 2), 'utf8');
    }
    return { skipped: false };
  } catch (error) {
    const stderr = String(error?.stderr || error?.message || error);
    throw new Error(`${stderr}\nIf Apper authorization expired, run: npm run mcp:apper:connect`);
  }
}

async function smokeControl() {
  const response = await fetch('http://127.0.0.1:3001/api/machine-ai/control', {
    method: 'POST',
    headers: { origin: PREVIEW, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      action: 'agency',
      task: 'Operational automation smoke test. Queue a short safe local specialist task only. Do not modify external systems.',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  if (response.status !== 202 || !payload?.ok || payload?.execution !== 'queued' || !payload?.queued?.id) {
    throw new Error(`Operational control smoke test failed: HTTP ${response.status} ${text.slice(0, 800)}`);
  }
  console.log(`Control smoke task queued: ${payload.queued.id}`);
}

function openPreview() {
  if (process.env.CI) return;
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/d', '/c', 'start', '', PREVIEW], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [PREVIEW], { detached: true, stdio: 'ignore' });
      child.unref();
    } else {
      const child = spawn('xdg-open', [PREVIEW], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch {}
}

function installStartup() {
  if (process.platform !== 'win32') throw new Error('Operational auto-start installer currently supports Windows only.');
  mkdirSync(STARTUP_DIR, { recursive: true });
  const node = process.execPath.replace(/"/g, '""');
  const script = fileURLToPath(import.meta.url).replace(/"/g, '""');
  const root = ROOT.replace(/"/g, '""');
  const content = [
    '@echo off',
    'rem BharatShop Machine AI operational runtime. User-level startup only; no elevation or scheduled task.',
    `cd /d "${root}"`,
    `start "BharatShop Machine AI" /min "${node}" "${script}" up --no-sync --no-deploy --no-open`,
    'exit /b 0',
    '',
  ].join('\r\n');
  writeFileSync(STARTUP_FILE, content, 'utf8');
  console.log(`Operational startup installed: ${STARTUP_FILE}`);
}

async function stopAll() {
  const pid = readPid(WEB_PID);
  if (pid) await killPidTree(pid);
  rmSync(WEB_PID, { force: true });
  await run(process.execPath, [MANAGER, 'stop'], 30_000);
  console.log('Machine AI web runtime and supervisor stop requested.');
}

async function showStatus() {
  const gitBranch = (await git('branch', '--show-current')).stdout;
  const gitHead = (await git('rev-parse', '--short', 'HEAD')).stdout;
  const status = await statusJson();
  console.log('\n=== BharatShop Machine AI Operational ===');
  console.log(`BRANCH: ${gitBranch || '(detached)'}`);
  console.log(`HEAD: ${gitHead}`);
  console.log(`WEB: ${status ? 'ONLINE' : 'OFFLINE'}`);
  console.log(`MODEL: ${status?.model || 'unknown'}`);
  console.log(`SUPERVISOR: ${status?.supervisor?.state || 'unknown'}`);
  console.log(`SPECIALISTS: ${status?.agents ?? 'unknown'}`);
  console.log(`STARTUP: ${STARTUP_FILE && existsSync(STARTUP_FILE) ? 'Installed' : 'Not installed'}`);
  console.log(`PREVIEW: ${PREVIEW}`);
}

async function up(options = {}) {
  if (!options.noSync) await syncBranch();
  await ensureSupervisor();
  const status = await ensureWeb();
  console.log(`Machine AI online: ${status.model} | specialists=${status.agents} | supervisor=${status.supervisor?.state || 'unknown'}`);
  if (options.smoke) await smokeControl();
  if (!options.noDeploy) await deployIfNeeded(options.forceDeploy);
  if (!options.noOpen) openPreview();
  await showStatus();
}

function parseOptions(args) {
  return {
    noSync: args.includes('--no-sync'),
    noDeploy: args.includes('--no-deploy'),
    noOpen: args.includes('--no-open'),
    forceDeploy: args.includes('--force-deploy'),
    smoke: args.includes('--smoke'),
  };
}

const [modeRaw = 'up', ...args] = process.argv.slice(2);
const mode = String(modeRaw).toLowerCase();

try {
  if (mode === 'up') {
    await up(parseOptions(args));
  } else if (mode === 'install') {
    installStartup();
    await up(parseOptions(args));
  } else if (mode === 'status') {
    await showStatus();
  } else if (mode === 'stop') {
    await stopAll();
  } else if (mode === 'uninstall') {
    await stopAll();
    if (STARTUP_FILE) rmSync(STARTUP_FILE, { force: true });
    console.log('Operational startup entry removed.');
  } else {
    throw new Error('Usage: node scripts/machine-ai-operational.mjs up|install|status|stop|uninstall [--no-sync] [--no-deploy] [--no-open] [--force-deploy] [--smoke]');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
