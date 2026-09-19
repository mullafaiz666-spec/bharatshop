#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import dotenv from 'dotenv';
import { discoverAgents } from './local-agency.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
dotenv.config({ path: join(root, '.env.local'), override: false });

const model = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || process.env.AI_TEXT_MODEL || 'qwen3.5:4b';
const pollMs = Math.max(5_000, Number(process.env.BHARATSHOP_MACHINE_AI_POLL_MS || 15_000));
const stateHome = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const pendingDir = join(stateHome, 'pending');
const runningDir = join(stateHome, 'running');
const resultsDir = join(stateHome, 'results');
const heartbeatFile = join(stateHome, 'heartbeat.json');
const logFile = join(stateHome, 'machine-ai.log');
const pidFile = join(stateHome, 'machine-ai.pid');
const shimScript = join(root, 'services', 'ollama-qwen-shim', 'server.mjs');
const personalAiScript = join(root, 'scripts', 'personal-ai.mjs');

for (const dir of [stateHome, pendingDir, runningDir, resultsDir]) mkdirSync(dir, { recursive: true });
writeFileSync(pidFile, String(process.pid), 'utf8');

function log(message, level = 'INFO') {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  appendFileSync(logFile, `${line}\n`, 'utf8');
  console.log(line);
}

function countFiles(dir) {
  try { return readdirSync(dir).filter(name => name.endsWith('.json')).length; } catch { return 0; }
}

function heartbeat(state, detail = '', extra = {}) {
  writeFileSync(heartbeatFile, JSON.stringify({
    updatedAt: new Date().toISOString(),
    supervisorPid: process.pid,
    state,
    detail,
    localModel: model,
    ollama: extra.ollama || 'UNKNOWN',
    qwenShim: extra.qwenShim || 'UNKNOWN',
    agents: Number.isFinite(extra.agents) ? extra.agents : 0,
    pendingTasks: countFiles(pendingDir),
    completedTasks: countFiles(resultsDir),
  }, null, 2), 'utf8');
}

async function fetchJson(url, options = {}, timeoutMs = 8_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return data;
}

function findOllama() {
  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ollama'], { encoding: 'utf8', windowsHide: true });
  if (which.status === 0) {
    const first = String(which.stdout || '').split(/\r?\n/).map(x => x.trim()).find(Boolean);
    if (first) return first;
  }
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe'),
    ];
    return candidates.find(existsSync) || '';
  }
  return 'ollama';
}

async function ollamaStatus() {
  try {
    const data = await fetchJson('http://127.0.0.1:11434/api/tags', {}, 5_000);
    const names = Array.isArray(data?.models) ? data.models.map(x => x?.name || x?.model).filter(Boolean) : [];
    return { ready: true, hasModel: names.includes(model) };
  } catch {
    return { ready: false, hasModel: false };
  }
}

async function ensureOllama() {
  let status = await ollamaStatus();
  const ollama = findOllama();
  if (!status.ready) {
    if (!ollama) throw new Error('Ollama executable not found');
    log('Starting Ollama on private loopback 127.0.0.1:11434.');
    const child = spawn(ollama, ['serve'], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1' },
    });
    child.unref();
    for (let i = 0; i < 30; i += 1) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
      status = await ollamaStatus();
      if (status.ready) break;
    }
  }
  if (!status.ready) throw new Error('Ollama did not become ready');
  if (!status.hasModel) {
    if (!ollama) throw new Error(`Model ${model} is missing and Ollama executable was not found`);
    log(`Pulling required free local model ${model}.`);
    const pull = spawnSync(ollama, ['pull', model], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (pull.status !== 0) throw new Error(`Could not pull ${model}`);
  }
}

async function shimReady() {
  try {
    const data = await fetchJson('http://127.0.0.1:11555/health', {}, 5_000);
    return data?.ok === true && Array.isArray(data?.models) && data.models.includes(model);
  } catch {
    return false;
  }
}

async function ensureShim() {
  if (await shimReady()) return;
  if (!existsSync(shimScript)) throw new Error('Qwen compatibility shim is missing');
  log('Starting BharatShop Qwen shim on private loopback 127.0.0.1:11555.');
  const child = spawn(process.execPath, [shimScript], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_SHIM_HOST: '127.0.0.1', OLLAMA_SHIM_PORT: '11555' },
  });
  child.unref();
  for (let i = 0; i < 20; i += 1) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
    if (await shimReady()) return;
  }
  throw new Error('Qwen compatibility shim did not become ready');
}

function agentCount() {
  try { return discoverAgents().length; } catch { return 0; }
}

function nextTaskFile() {
  try {
    return readdirSync(pendingDir).filter(name => name.endsWith('.json')).sort()[0] || '';
  } catch {
    return '';
  }
}

function runOneQueuedTask() {
  const name = nextTaskFile();
  if (!name) return false;
  const pending = join(pendingDir, name);
  const running = join(runningDir, name);
  renameSync(pending, running);

  let task;
  try {
    task = JSON.parse(readFileSync(running, 'utf8'));
  } catch (error) {
    writeFileSync(join(resultsDir, name), JSON.stringify({ ok: false, error: `Invalid task file: ${error.message}` }, null, 2), 'utf8');
    rmSync(running, { force: true });
    return true;
  }

  const prompt = String(task?.task || '').trim();
  const route = String(task?.route || '').trim().toLowerCase();
  if (!prompt) {
    writeFileSync(join(resultsDir, name), JSON.stringify({ ...task, ok: false, error: 'Task text is empty', finishedAt: new Date().toISOString() }, null, 2), 'utf8');
    rmSync(running, { force: true });
    return true;
  }

  const args = [personalAiScript, 'task', prompt];
  if (route && ['chat', 'agency'].includes(route)) args.push('--route', route);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: Number(process.env.BHARATSHOP_MACHINE_AI_TASK_TIMEOUT_MS || 900_000),
    env: {
      ...process.env,
      PERSONAL_AI_MODEL: model,
      AGENCY_MODEL: model,
      PERSONAL_AI_CONTEXT: process.env.PERSONAL_AI_CONTEXT || '4096',
      AGENCY_CONTEXT: process.env.AGENCY_CONTEXT || '4096',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    },
  });

  const completed = {
    ...task,
    finishedAt: new Date().toISOString(),
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    output: String(result.stdout || '').trim(),
    error: String(result.stderr || '').trim(),
  };
  writeFileSync(join(resultsDir, name), JSON.stringify(completed, null, 2), 'utf8');
  rmSync(running, { force: true });
  log(`Local task ${task.id || name} completed with exit code ${completed.exitCode}.`);
  return true;
}

let stopping = false;
const stop = () => { stopping = true; heartbeat('STOPPING', 'Shutdown requested'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

log(`BharatShop local machine AI supervisor starting. Model=${model}`);
heartbeat('STARTING', 'Initializing private local AI');
let errorCount = 0;

try {
  while (!stopping) {
    try {
      await ensureOllama();
      await ensureShim();
      const agents = agentCount();
      if (!agents) {
        heartbeat('WAITING_FOR_AGENTS', 'Agency catalog is not installed; run npm.cmd run agency:setup', { ollama: 'READY', qwenShim: 'READY', agents });
        await new Promise(resolvePromise => setTimeout(resolvePromise, pollMs));
        continue;
      }

      heartbeat('LOCAL_READY', 'Private local AI and agency workforce are ready', { ollama: 'READY', qwenShim: 'READY', agents });
      const processed = runOneQueuedTask();
      if (processed) heartbeat('LOCAL_READY', 'Queued local task completed; worker is ready', { ollama: 'READY', qwenShim: 'READY', agents });
      await new Promise(resolvePromise => setTimeout(resolvePromise, processed ? 1_000 : pollMs));
    } catch (error) {
      errorCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      log(`Local machine AI cycle error: ${message}`, 'ERROR');
      heartbeat('ERROR', message.slice(0, 300), { agents: agentCount() });
      await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(60_000, 5_000 * errorCount)));
    }
  }
} finally {
  rmSync(pidFile, { force: true });
  heartbeat('STOPPED', 'Local machine AI supervisor exited', { agents: agentCount() });
  log('BharatShop local machine AI supervisor stopped.');
}
