#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const APPER_MCP_URL = 'https://mcp.apper.io/v1/connect';
const MCP_REMOTE_VERSION = '0.1.38';
const MARKER_FILE = join(homedir(), '.bharatshop-ai', 'apper-mcp-authorized.json');
const DEFAULT_CALLBACK_PORT = Number(process.env.BHARATSHOP_APPER_MCP_CALLBACK_PORT || 52774);
const DEFAULT_TIMEOUT_MS = 90_000;

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
}

function validPort(value) {
  const port = Number(value || 0);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 0;
}

function npxInvocation(args) {
  if (process.platform === 'win32') {
    const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    return { command: process.execPath, args: [npxCli, ...args] };
  }
  return { command: 'npx', args };
}

function spawnNpx(args, options) {
  const invocation = npxInvocation(args);
  return spawn(invocation.command, invocation.args, {
    ...options,
    shell: false,
  });
}

async function terminateChildTree(child) {
  if (!child?.pid || child.exitCode !== null) return;

  if (process.platform !== 'win32') {
    try { child.kill(); } catch {}
    return;
  }

  await new Promise(resolvePromise => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      shell: false,
    });
    killer.once('error', () => resolvePromise());
    killer.once('close', () => resolvePromise());
  });
}

async function hasMarker() {
  try {
    await access(MARKER_FILE);
    return true;
  } catch {
    return false;
  }
}

async function readAuthorizedState() {
  if (!(await hasMarker())) return null;
  try {
    const parsed = JSON.parse(await readFile(MARKER_FILE, 'utf8'));
    if (parsed?.connector !== 'apper' || parsed?.endpoint !== APPER_MCP_URL) return null;
    const callbackPort = validPort(parsed?.callbackPort) || validPort(DEFAULT_CALLBACK_PORT);
    if (!callbackPort) return null;
    return { ...parsed, callbackPort };
  } catch {
    return null;
  }
}

async function markAuthorized(callbackPort) {
  await mkdir(dirname(MARKER_FILE), { recursive: true });
  await writeFile(MARKER_FILE, `${JSON.stringify({
    connector: 'apper',
    endpoint: APPER_MCP_URL,
    callbackHost: '127.0.0.1',
    callbackPort,
    authenticatedAt: new Date().toISOString(),
    credentialOwner: 'mcp-remote local OAuth cache',
    authMode: 'persistent-cached-oauth',
    containsSecret: false,
  }, null, 2)}\n`, 'utf8');
}

function publicAuthState(callbackPort, extra = {}) {
  return {
    connector: 'apper',
    state: 'AUTHORIZED',
    readOnly: true,
    endpoint: APPER_MCP_URL,
    callbackHost: '127.0.0.1',
    callbackPort,
    persistent: true,
    ...extra,
    note: 'OAuth credentials are owned by the local mcp-remote cache and are reused until the provider revokes or invalidates them.',
  };
}

async function spawnRemoteProxy(callbackPort) {
  const child = spawnNpx(
    ['-y', `mcp-remote@${MCP_REMOTE_VERSION}`, APPER_MCP_URL, String(callbackPort), '--host', '127.0.0.1', '--transport', 'http-only'],
    {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    },
  );

  let buffer = '';
  let stderrTail = '';
  let nextId = 0;
  const pending = new Map();

  function failAll(error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  child.stdout.on('data', chunk => {
    buffer += String(chunk || '');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message?.id == null || !pending.has(message.id)) continue;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`MCP_${message.error.code}:${redact(message.error.message)}`));
      else entry.resolve(message.result ?? message);
    }
  });

  child.stderr.on('data', chunk => {
    stderrTail += redact(String(chunk || ''));
    if (stderrTail.length > 8_000) stderrTail = stderrTail.slice(-8_000);
  });

  child.on('error', error => failAll(error));
  child.on('close', code => {
    if (pending.size) {
      failAll(new Error(`Apper MCP bridge exited with code ${code ?? 'unknown'}${stderrTail ? `: ${stderrTail.slice(-1200)}` : ''}`));
    }
  });

  function request(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const id = ++nextId;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Apper MCP request timed out: ${method}${stderrTail ? `; ${stderrTail.slice(-800)}` : ''}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolvePromise(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async function close() {
    try { child.stdin.end(); } catch {}
    await terminateChildTree(child);
  }

  return { request, notify, close };
}

async function withApperProxy(operation) {
  const authorized = await readAuthorizedState();
  if (!authorized) {
    throw new Error('AUTH_REQUIRED:apper:run npm.cmd run mcp:apper:connect');
  }
  const proxy = await spawnRemoteProxy(authorized.callbackPort);
  try {
    await proxy.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'bharatshop-machine-ai-apper', version: '1.0.0' },
    });
    proxy.notify('notifications/initialized', {});
    return await operation(proxy);
  } finally {
    await proxy.close();
  }
}

async function connectInteractive(force = false) {
  const existing = await readAuthorizedState();

  // Normal connect is intentionally idempotent. Once OAuth has been approved,
  // keep using the exact same callback registration and mcp-remote token cache.
  // A browser should only open again after an explicit --force or when the
  // provider itself invalidates/revokes the cached grant during a real call.
  if (existing && !force) {
    console.log(JSON.stringify(publicAuthState(existing.callbackPort, {
      reused: true,
      authenticatedAt: existing.authenticatedAt || null,
    }), null, 2));
    return;
  }

  const callbackPort = existing?.callbackPort || validPort(DEFAULT_CALLBACK_PORT);
  if (!callbackPort) throw new Error('Invalid Apper MCP callback port.');
  console.error(`Apper OAuth callback port: ${callbackPort}`);

  const authState = await new Promise((resolvePromise, reject) => {
    const child = spawnNpx(
      ['-y', '-p', `mcp-remote@${MCP_REMOTE_VERSION}`, 'mcp-remote-client', APPER_MCP_URL, String(callbackPort), '--host', '127.0.0.1'],
      {
        windowsHide: false,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env,
      },
    );

    let settled = false;
    let combinedTail = '';

    function observe(chunk, target) {
      const text = redact(String(chunk || ''));
      target.write(text);
      combinedTail += text;
      if (combinedTail.length > 16_000) combinedTail = combinedTail.slice(-16_000);

      if (!settled && /Connected successfully!/i.test(combinedTail)) {
        settled = true;
        // Give mcp-remote time to flush its durable OAuth/client registration
        // before cleaning up the helper process tree.
        setTimeout(() => {
          terminateChildTree(child)
            .catch(() => {})
            .finally(() => resolvePromise('AUTHORIZED'));
        }, 1500);
      }
    }

    child.stdout.on('data', chunk => observe(chunk, process.stdout));
    child.stderr.on('data', chunk => observe(chunk, process.stderr));
    child.on('error', error => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', code => {
      if (!settled) {
        settled = true;
        if (code === 0) resolvePromise('AUTHORIZED');
        else reject(new Error(`Apper OAuth connection failed with exit code ${code ?? 'unknown'}.`));
      }
    });
  });

  if (authState !== 'AUTHORIZED') throw new Error('Apper OAuth did not reach an authorized connection state.');
  await markAuthorized(callbackPort);
  console.log(JSON.stringify(publicAuthState(callbackPort, { reused: false }), null, 2));
}

async function listTools() {
  const result = await withApperProxy(proxy => proxy.request('tools/list', {}, 120_000));
  return { tools: Array.isArray(result?.tools) ? result.tools : [] };
}

async function parseToolArgs(rawArgs) {
  let text = String(rawArgs || '').trim();
  if (!text) return {};
  if (text.startsWith('@')) {
    const argsPath = resolve(text.slice(1));
    text = await readFile(argsPath, 'utf8');
  }
  try { return JSON.parse(text); }
  catch { throw new Error('Apper MCP tool arguments must be valid JSON.'); }
}

async function callTool(toolName, rawArgs) {
  if (!toolName) throw new Error('Apper MCP tool name is required.');
  const args = await parseToolArgs(rawArgs);
  return withApperProxy(proxy => proxy.request('tools/call', { name: toolName, arguments: args }, 180_000));
}

async function main() {
  const [command = 'tools', toolName, rawArgs] = process.argv.slice(2);
  if (command === 'connect') return connectInteractive(process.argv.slice(2).includes('--force'));
  if (command === 'tools') {
    console.log(JSON.stringify(await listTools()));
    return;
  }
  if (command === 'call') {
    console.log(JSON.stringify(await callTool(toolName, rawArgs)));
    return;
  }
  throw new Error('Usage: node scripts/apper-mcp-client.mjs connect [--force] | tools | call <tool> [args-json|@args-file]');
}

main().catch(error => {
  console.error(redact(error?.message || error));
  process.exitCode = 1;
});
