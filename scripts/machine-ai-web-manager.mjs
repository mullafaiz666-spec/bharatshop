#!/usr/bin/env node

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { isMachineAiStatus } from './machine-ai-web-readiness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const port = Number(process.env.BHARATSHOP_MACHINE_UI_PORT || '3002');
const url = `http://127.0.0.1:${port}`;
const stateHome = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI', 'WebUI');
const pidFile = join(stateHome, 'web-ui.pid');
const logFile = join(stateHome, 'web-ui.log');
const serverScript = join(root, 'scripts', 'machine-ai-web.mjs');
const startupDir = process.env.APPDATA ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') : '';
const startupFile = startupDir ? join(startupDir, 'BharatShop-Machine-AI-Web.cmd') : '';
mkdirSync(stateHome, { recursive: true });

function log(message) {
  appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function readPid() {
  try { return Number(readFileSync(pidFile, 'utf8').trim()); } catch { return 0; }
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function ready() {
  try {
    const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(2_000), cache: 'no-store' });
    if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) return false;
    return isMachineAiStatus(await response.json());
  } catch { return false; }
}

function openBrowser() {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function start({ open = false } = {}) {
  const oldPid = readPid();
  if (alive(oldPid) || await ready()) {
    console.log(`BharatShop Machine AI UI is already running at ${url}${oldPid ? ` (PID ${oldPid})` : ''}.`);
    if (open) openBrowser();
    return;
  }
  rmSync(pidFile, { force: true });
  const logFd = openSync(logFile, 'a');
  const child = spawn(process.execPath, [serverScript], {
    cwd: root,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env: { ...process.env, BHARATSHOP_MACHINE_UI_PORT: String(port) },
  });
  child.unref();
  closeSync(logFd);
  writeFileSync(pidFile, String(child.pid), 'utf8');
  log(`started PID ${child.pid}`);
  for (let i = 0; i < 30; i += 1) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 300));
    if (await ready()) {
      console.log(`BharatShop Machine AI UI ready: ${url}`);
      if (open) openBrowser();
      return;
    }
  }
  throw new Error(`Machine AI UI did not become ready. Check ${logFile}`);
}

async function stop() {
  const pid = readPid();
  if (!pid || !alive(pid)) {
    rmSync(pidFile, { force: true });
    console.log('BharatShop Machine AI UI is not running.');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  rmSync(pidFile, { force: true });
  log(`stopped PID ${pid}`);
  console.log('BharatShop Machine AI UI stopped.');
}

async function status() {
  const pid = readPid();
  const isReady = await ready();
  console.log(`BharatShop Machine AI UI: ${isReady ? 'READY' : 'STOPPED'}`);
  console.log(`URL: ${url}`);
  console.log(`PID: ${alive(pid) ? pid : 'none'}`);
  console.log(`Startup: ${startupFile && existsSync(startupFile) ? 'Installed' : 'Not installed'}`);
  console.log(`Log: ${logFile}`);
}

async function install() {
  if (process.platform !== 'win32' || !startupFile) throw new Error('Startup install is currently supported on Windows only.');
  mkdirSync(startupDir, { recursive: true });
  const manager = join(root, 'scripts', 'machine-ai-web-manager.mjs');
  const body = `@echo off\r\ncd /d "${root}"\r\n"${process.execPath}" "${manager}" start >> "${logFile}" 2>&1\r\n`;
  writeFileSync(startupFile, body, 'utf8');
  console.log(`Startup entry installed: ${startupFile}`);
  await start({ open: true });
}

async function uninstall() {
  await stop();
  if (startupFile) rmSync(startupFile, { force: true });
  console.log('BharatShop Machine AI UI startup entry removed.');
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'start') await start({ open: args.includes('--open') });
  else if (command === 'stop') await stop();
  else if (command === 'status') await status();
  else if (command === 'install') await install();
  else if (command === 'uninstall') await uninstall();
  else {
    console.log('Usage: node scripts/machine-ai-web-manager.mjs start [--open] | stop | status | install | uninstall');
    process.exit(command ? 2 : 0);
  }
} catch (error) {
  console.error(`Machine AI web manager error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
