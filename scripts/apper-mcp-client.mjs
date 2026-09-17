#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const APPER_MCP_URL = 'https://mcp.apper.io/v1/connect';
const MCP_REMOTE_VERSION = '0.1.38';
const MARKER_FILE = join(homedir(), '.bharatshop-ai', 'apper-mcp-authorized.json');
const DEFAULT_TIMEOUT_MS = 90_000;

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
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

async function reserveFreeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => {
        if (error) reject(error);
        else if (!port) reject(new Error('Could not allocate a free localhost OAuth callback port.'));
        else resolve(port);
      });
    });
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

async function markAuthorized() {
  await mkdir(dirname(MARKER_FILE), { recursive: true });
  await writeFile(MARKER_FILE, `${JSON.stringify({
    connector: 'apper',
    endpoint: APPER_MCP_URL,
    authenticatedAt: new Date().toISOString(),
    credentialOwner: 'mcp-remote local OAuth cache',
    containsSecret: false,
  }, null, 2)}\n`, 'utf8');
}

async function spawnRemoteProxy() {
  const callbackPort = await reserveFreeLoopbackPort();
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
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Apper MCP request timed out: ${method}${stderrTail ? `; ${stderrTail.slice(-800)}` : ''}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
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
    try { child.kill(); } catch {}
  }

  return { request, notify, close };
}

async function withApperProxy(operation) {
  if (!(await hasMarker())) {
    throw new Error('AUTH_REQUIRED:apper:run npm.cmd run mcp:apper:connect');
  }
  const proxy = await spawnRemoteProxy();
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

async function connectInteractive() {
  const callbackPort = await reserveFreeLoopbackPort();
  console.error(`Apper OAuth callback port: ${callbackPort}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawnNpx(
      ['-y', '-p', `mcp-remote@${MCP_REMOTE_VERSION}`, 'mcp-remote-client', APPER_MCP_URL, String(callbackPort), '--host', '127.0.0.1'],
      {
        windowsHide: false,
        stdio: 'inherit',
        env: process.env,
      },
    );
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Apper OAuth connection failed with exit code ${exitCode}.`);
  await markAuthorized();
  console.log(JSON.stringify({
    connector: 'apper',
    state: 'AUTHORIZED',
    readOnly: true,
    endpoint: APPER_MCP_URL,
    note: 'OAuth credentials are owned by the local mcp-remote cache and are not stored in BharatShop.',
  }, null, 2));
}

async function listTools() {
  const result = await withApperProxy(proxy => proxy.request('tools/list', {}, 120_000));
  return { tools: Array.isArray(result?.tools) ? result.tools : [] };
}

async function callTool(toolName, rawArgs) {
  if (!toolName) throw new Error('Apper MCP tool name is required.');
  let args = {};
  if (rawArgs) {
    try { args = JSON.parse(rawArgs); } catch { throw new Error('Apper MCP tool arguments must be valid JSON.'); }
  }
  return withApperProxy(proxy => proxy.request('tools/call', { name: toolName, arguments: args }, 180_000));
}

async function main() {
  const [command = 'tools', toolName, rawArgs] = process.argv.slice(2);
  if (command === 'connect') return connectInteractive();
  if (command === 'tools') {
    console.log(JSON.stringify(await listTools()));
    return;
  }
  if (command === 'call') {
    console.log(JSON.stringify(await callTool(toolName, rawArgs)));
    return;
  }
  throw new Error('Usage: node scripts/apper-mcp-client.mjs connect | tools | call <tool> [args-json]');
}

main().catch(error => {
  console.error(redact(error?.message || error));
  process.exitCode = 1;
});
