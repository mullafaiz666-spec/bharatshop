#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const stateHome = process.env.BHARATSHOP_BRAIN_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'BharatShop', 'BrainV2');
const pidFile = join(stateHome, 'brain.pid');
const heartbeatFile = join(stateHome, 'heartbeat.json');
const brain = join(root, 'scripts', 'company-brain-v2.mjs');
mkdirSync(stateHome, { recursive: true });

function pid() { try { return Number(readFileSync(pidFile, 'utf8').trim()) || 0; } catch { return 0; } }
function alive(n) { if (!n) return false; try { process.kill(n, 0); return true; } catch { return false; } }
function heartbeat() { try { return JSON.parse(readFileSync(heartbeatFile, 'utf8')); } catch { return null; } }
function start() {
  const current = pid();
  if (alive(current)) { console.log(`BharatShop Company Brain already running (PID ${current}).`); return; }
  if (!existsSync(brain)) throw new Error(`Brain script missing: ${brain}`);
  const child = spawn(process.execPath, [brain], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env } });
  child.unref();
  console.log(`BharatShop Company Brain starting (PID ${child.pid}).`);
}
function stop() {
  const current = pid();
  if (!alive(current)) { console.log('BharatShop Company Brain is not running.'); return; }
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(current), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else process.kill(current, 'SIGTERM');
  console.log(`BharatShop Company Brain stopped (PID ${current}).`);
}
function status() {
  const current = pid(); const hb = heartbeat();
  console.log(JSON.stringify({ running: alive(current), pid: current || null, heartbeat: hb }, null, 2));
}
const command = String(process.argv[2] || 'status').toLowerCase();
if (command === 'start') start();
else if (command === 'stop') stop();
else if (command === 'restart') { stop(); setTimeout(start, 1000); }
else if (command === 'status') status();
else { console.error('Usage: node scripts/company-brain-manager.mjs start|stop|restart|status'); process.exit(2); }
