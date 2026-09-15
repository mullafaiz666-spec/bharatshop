#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const supervisor = join(here, 'machine-ai-supervisor.mjs');
const stateHome = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const heartbeatFile = join(stateHome, 'heartbeat.json');
const pidFile = join(stateHome, 'machine-ai.pid');
const startupDir = process.platform === 'win32'
  ? join(process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  : '';
const startupFile = process.platform === 'win32' ? join(startupDir, 'BharatShop-Local-Machine-AI.cmd') : '';

mkdirSync(stateHome, { recursive: true });

function readPid() {
  try { return Number(readFileSync(pidFile, 'utf8').trim()) || 0; } catch { return 0; }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function countJson(dir) {
  try { return readdirSync(join(stateHome, dir)).filter(name => name.endsWith('.json')).length; } catch { return 0; }
}

function showStatus() {
  const pid = readPid();
  console.log('\n=== BharatShop Local Machine AI ===');
  console.log(`STARTUP ENTRY: ${startupFile && existsSync(startupFile) ? 'Installed' : 'Not installed'}`);
  console.log(`SUPERVISOR: ${pidAlive(pid) ? `Running (PID ${pid})` : 'Stopped'}`);
  if (existsSync(heartbeatFile)) {
    try {
      const h = JSON.parse(readFileSync(heartbeatFile, 'utf8'));
      console.log(`STATE: ${h.state || 'unknown'}`);
      console.log(`UPDATED: ${h.updatedAt || 'unknown'}`);
      console.log(`LOCAL MODEL: ${h.localModel || 'unknown'}`);
      console.log(`OLLAMA: ${h.ollama || 'unknown'}`);
      console.log(`QWEN SHIM: ${h.qwenShim || 'unknown'}`);
      console.log(`AGENTS: ${h.agents ?? 'unknown'}`);
      console.log(`PENDING TASKS: ${h.pendingTasks ?? countJson('pending')}`);
      console.log(`COMPLETED TASKS: ${h.completedTasks ?? countJson('results')}`);
      console.log(`DETAIL: ${h.detail || ''}`);
    } catch {
      console.log('HEARTBEAT: unreadable');
    }
  } else {
    console.log('HEARTBEAT: not written yet');
  }
  console.log(`STATE HOME: ${stateHome}`);
}

function startSupervisor() {
  const pid = readPid();
  if (pidAlive(pid)) {
    console.log(`BharatShop local machine AI is already running (PID ${pid}).`);
    return;
  }
  if (!existsSync(supervisor)) throw new Error(`Supervisor missing: ${supervisor}`);
  const child = spawn(process.execPath, [supervisor], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: process.env,
  });
  child.unref();
  console.log('BharatShop local machine AI supervisor started.');
}

function stopSupervisor() {
  const pid = readPid();
  if (!pidAlive(pid)) {
    rmSync(pidFile, { force: true });
    console.log('BharatShop local machine AI supervisor is already stopped.');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Stop requested for local machine AI supervisor PID ${pid}.`);
  } catch {
    rmSync(pidFile, { force: true });
    console.log('Could not signal recorded supervisor PID; stale PID file removed.');
  }
}

function installStartup() {
  if (process.platform !== 'win32') throw new Error('Automatic startup installer currently supports Windows only.');
  mkdirSync(startupDir, { recursive: true });
  const node = process.execPath.replace(/"/g, '""');
  const script = supervisor.replace(/"/g, '""');
  const cwd = root.replace(/"/g, '""');
  const content = [
    '@echo off',
    'rem BharatShop private local AI starts at user logon. No elevation, no PowerShell bypass, no scheduled task.',
    `cd /d "${cwd}"`,
    `start "BharatShop Local Machine AI" /min "${node}" "${script}"`,
    'exit /b 0',
    '',
  ].join('\r\n');
  writeFileSync(startupFile, content, 'utf8');
  console.log(`Startup entry installed: ${startupFile}`);
}

function uninstallStartup() {
  if (startupFile) rmSync(startupFile, { force: true });
  console.log('BharatShop local machine AI startup entry removed.');
}

const mode = String(process.argv[2] || 'status').toLowerCase();
try {
  if (mode === 'install') {
    installStartup();
    startSupervisor();
    setTimeout(showStatus, 2500);
  } else if (mode === 'start') {
    startSupervisor();
    setTimeout(showStatus, 1500);
  } else if (mode === 'stop') {
    stopSupervisor();
    setTimeout(showStatus, 800);
  } else if (mode === 'uninstall') {
    stopSupervisor();
    uninstallStartup();
    setTimeout(showStatus, 800);
  } else if (mode === 'status') {
    showStatus();
  } else {
    throw new Error('Usage: node scripts/machine-ai-manager.mjs install|start|stop|status|uninstall');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
