#!/usr/bin/env node

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.BHARATSHOP_LOCAL_APP_PORT || '3001');
const url = `http://${HOST}:${PORT}`;
const stateHome = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BharatShop', 'LocalStorefront');
const pidFile = join(stateHome, 'storefront.pid');
const logFile = join(stateHome, 'storefront.log');
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildId = join(root, '.next', 'BUILD_ID');
mkdirSync(stateHome, { recursive: true });

function readPid() {
  try { return Number(readFileSync(pidFile, 'utf8').trim()) || 0; } catch { return 0; }
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function probe(pathname = '/') {
  try {
    const response = await fetch(`${url}${pathname}`, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    return {
      path: pathname,
      reachable: response.status >= 200 && response.status < 500,
      status: response.status,
    };
  } catch (error) {
    return {
      path: pathname,
      reachable: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function statusPayload() {
  const pid = readPid();
  const rootProbe = await probe('/');
  return {
    ok: rootProbe.reachable,
    state: rootProbe.reachable ? 'READY' : alive(pid) ? 'STARTING_OR_UNHEALTHY' : 'STOPPED',
    url,
    pid: alive(pid) ? pid : null,
    buildPresent: existsSync(buildId),
    root: rootProbe,
    logFile,
  };
}

async function start() {
  const current = await statusPayload();
  if (current.ok) return current;
  if (!existsSync(nextBin)) throw new Error('Next.js runtime is not installed. Run npm ci first.');
  if (!existsSync(buildId)) throw new Error('Production build is missing. Run the cockpit full verification before starting the local storefront.');

  const oldPid = readPid();
  if (alive(oldPid)) {
    throw new Error(`A recorded storefront process is running (PID ${oldPid}) but is not healthy. Stop it before starting another.`);
  }

  rmSync(pidFile, { force: true });
  const fd = openSync(logFile, 'a');
  appendFileSync(logFile, `${new Date().toISOString()} starting ${url}\n`, 'utf8');
  const child = spawn(process.execPath, [nextBin, 'start', '-H', HOST, '-p', String(PORT)], {
    cwd: root,
    detached: true,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    env: { ...process.env, HOSTNAME: HOST, PORT: String(PORT), NODE_ENV: 'production' },
  });
  child.unref();
  closeSync(fd);
  writeFileSync(pidFile, String(child.pid), 'utf8');

  for (let i = 0; i < 40; i += 1) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
    const status = await statusPayload();
    if (status.ok) return status;
    if (!alive(child.pid)) break;
  }
  throw new Error(`Local storefront did not become ready. Check ${logFile}`);
}

async function stop() {
  const pid = readPid();
  if (!alive(pid)) {
    rmSync(pidFile, { force: true });
    return await statusPayload();
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  rmSync(pidFile, { force: true });
  await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  return await statusPayload();
}

async function smoke() {
  const before = await statusPayload();
  if (!before.ok) throw new Error('Local storefront is not running. Start it before the smoke check.');
  const probes = [];
  for (const pathname of ['/', '/bharatdrip']) probes.push(await probe(pathname));
  const ok = probes.every(item => item.reachable);
  return { ok, url, probes, mode: 'READ_ONLY_HTTP_SMOKE' };
}

async function main() {
  const command = String(process.argv[2] || 'status').toLowerCase();
  let result;
  if (command === 'status') result = await statusPayload();
  else if (command === 'start') result = await start();
  else if (command === 'stop') result = await stop();
  else if (command === 'smoke') result = await smoke();
  else throw new Error('Usage: node scripts/local-storefront-manager.mjs status|start|stop|smoke');
  console.log(JSON.stringify(result, null, 2));
  if (command === 'smoke' && !result.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
