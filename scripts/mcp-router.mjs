#!/usr/bin/env node

import { appendFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..');
const DEFAULT_CONFIG = join(PROJECT_ROOT, 'config', 'mcp-connectors.json');
const DEFAULT_TIMEOUT_MS = 20_000;
const AUDIT_DIR = join(homedir(), '.bharatshop-ai');
const AUDIT_FILE = join(AUDIT_DIR, 'mcp-audit.jsonl');

function envExpand(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => process.env[key] ?? '');
}

export function redactText(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
}

export function assertInsideRoot(root, candidate) {
  const base = resolve(root);
  const target = resolve(base, candidate);
  const rel = relative(base, target);
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) return target;
  throw new Error('Path escapes BharatShop project sandbox.');
}

export function isWriteLikeTool(name) {
  return /(^|_)(create|update|delete|remove|merge|deploy|push|commit|apply|reset|pause|restore|upload|publish|write|insert|upsert|drop|truncate|reseed|migrate|cancel|close|lock|unlock|rerun|dismiss|resolve|unresolve|approve|assign|label)(_|$)/i.test(String(name));
}

export async function loadMcpConfig(configPath = process.env.MACHINE_AI_MCP_CONFIG || DEFAULT_CONFIG) {
  const parsed = JSON.parse(await readFile(configPath, 'utf8'));
  if (parsed?.version !== 1 || !parsed?.connectors || typeof parsed.connectors !== 'object') {
    throw new Error('Invalid MCP connector configuration.');
  }
  const connectors = {};
  for (const [name, raw] of Object.entries(parsed.connectors)) {
    connectors[name] = {
      ...raw,
      url: envExpand(raw.url),
      headers: Object.fromEntries(Object.entries(raw.headers || {}).map(([k, v]) => [k, envExpand(v)])),
    };
    if (connectors[name].enabled !== false && connectors[name].readOnly !== true) {
      throw new Error(`Connector ${name} must be readOnly=true in Machine AI.`);
    }
    if (connectors[name].type === 'http' && !/^https:\/\//i.test(connectors[name].url || '')) {
      throw new Error(`Connector ${name} must use HTTPS.`);
    }
  }
  return { ...parsed, connectors, configPath };
}

function parseSse(text) {
  const messages = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try { messages.push(JSON.parse(payload)); } catch {}
  }
  return messages;
}

class HttpMcpClient {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.sessionId = null;
    this.connected = false;
    this.id = 0;
  }

  requestHeaders() {
    const headers = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...this.config.headers,
    };
    if (this.config.authEnv) {
      const token = process.env[this.config.authEnv];
      if (!token) throw new Error(`AUTH_REQUIRED:${this.config.authEnv}`);
      headers.authorization = `Bearer ${token}`;
    }
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    return headers;
  }

  async post(body, { timeoutMs = DEFAULT_TIMEOUT_MS, allowEmpty = false } = {}) {
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.requestHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.headers.get('mcp-session-id')) this.sessionId = response.headers.get('mcp-session-id');
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP_${response.status}:${redactText(text).slice(0, 300)}`);
    if (!text.trim()) {
      if (allowEmpty) return null;
      throw new Error('Empty MCP response.');
    }
    const contentType = response.headers.get('content-type') || '';
    const candidates = contentType.includes('text/event-stream') ? parseSse(text) : [JSON.parse(text)];
    const message = candidates.find(item => item?.id === body.id) || candidates.at(-1);
    if (message?.error) throw new Error(`MCP_${message.error.code}:${redactText(message.error.message)}`);
    return message?.result ?? message;
  }

  async connect() {
    if (this.connected) return;
    await this.post({
      jsonrpc: '2.0', id: ++this.id, method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'bharatshop-machine-ai', version: '1.0.0' },
      },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, { allowEmpty: true });
    this.connected = true;
  }

  async listTools() {
    await this.connect();
    const result = await this.post({ jsonrpc: '2.0', id: ++this.id, method: 'tools/list', params: {} });
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name, args = {}) {
    await this.connect();
    return this.post({ jsonrpc: '2.0', id: ++this.id, method: 'tools/call', params: { name, arguments: args } }, { timeoutMs: 120_000 });
  }
}

async function runFixed(command, args, cwd, timeout = 120_000) {
  const { stdout, stderr } = await execFileAsync(command, args, { cwd, timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  return { stdout: redactText(stdout).trim(), stderr: redactText(stderr).trim() };
}

async function walk(root, dir = root, depth = 0, output = []) {
  if (depth > 3 || output.length >= 300) return output;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.next', 'coverage'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    output.push(relative(root, full));
    if (entry.isDirectory()) await walk(root, full, depth + 1, output);
    if (output.length >= 300) break;
  }
  return output;
}

export function localToolDefinitions() {
  return [
    ['project_status', 'Read project root and current Git branch/status.', { type: 'object', properties: {}, additionalProperties: false }],
    ['git_status', 'Read git status for the BharatShop project.', { type: 'object', properties: {}, additionalProperties: false }],
    ['git_diff', 'Read the current git diff without modifying files.', { type: 'object', properties: {}, additionalProperties: false }],
    ['git_log', 'Read recent git commits.', { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }],
    ['list_project_files', 'List project files inside the BharatShop sandbox.', { type: 'object', properties: {}, additionalProperties: false }],
    ['read_project_file', 'Read a UTF-8 text file inside the BharatShop sandbox.', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false }],
    ['npm_test', 'Run BharatShop integration tests locally. This does not deploy.', { type: 'object', properties: {}, additionalProperties: false }],
    ['npm_build', 'Run the local BharatShop production build. This writes local build artifacts only.', { type: 'object', properties: {}, additionalProperties: false }],
    ['ollama_health', 'Check local Ollama model endpoint health.', { type: 'object', properties: {}, additionalProperties: false }],
    ['machine_ai_health', 'Check the local Machine AI web endpoint.', { type: 'object', properties: {}, additionalProperties: false }],
    ['queue_status', 'Inspect local Machine AI queue directory counts.', { type: 'object', properties: {}, additionalProperties: false }],
  ].map(([name, description, inputSchema]) => ({ name, description, inputSchema }));
}

async function callLocalTool(root, name, args = {}) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (name === 'project_status') {
    const branch = await runFixed('git', ['branch', '--show-current'], root);
    const status = await runFixed('git', ['status', '--short', '--branch'], root);
    return { root, branch: branch.stdout, status: status.stdout };
  }
  if (name === 'git_status') return runFixed('git', ['status', '--short', '--branch'], root);
  if (name === 'git_diff') return runFixed('git', ['diff', '--'], root);
  if (name === 'git_log') return runFixed('git', ['log', `-${Math.min(20, Math.max(1, Number(args.count || 5)))}`, '--oneline', '--decorate'], root);
  if (name === 'list_project_files') return { files: await walk(root) };
  if (name === 'read_project_file') {
    const file = assertInsideRoot(root, String(args.path || ''));
    const info = await stat(file);
    if (!info.isFile() || info.size > 512_000) throw new Error('File must be a text file <= 512 KB.');
    return { path: relative(root, file), content: await readFile(file, 'utf8') };
  }
  if (name === 'npm_test') return runFixed(npm, ['run', 'test:integrations'], root, 10 * 60_000);
  if (name === 'npm_build') return runFixed(npm, ['run', 'build'], root, 15 * 60_000);
  if (name === 'ollama_health') {
    const response = await fetch(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(8_000) });
    const data = await response.json();
    return { ok: response.ok, models: (data?.models || []).map(item => item.name || item.model).filter(Boolean) };
  }
  if (name === 'machine_ai_health') {
    const response = await fetch('http://127.0.0.1:3001/api/project', { signal: AbortSignal.timeout(8_000) });
    return { ok: response.ok, status: response.status, project: response.ok ? await response.json() : null };
  }
  if (name === 'queue_status') {
    const base = join(homedir(), '.bharatshop-ai');
    const counts = {};
    for (const folder of ['pending', 'running', 'results']) {
      try { counts[folder] = (await readdir(join(base, folder))).length; } catch { counts[folder] = 0; }
    }
    return counts;
  }
  throw new Error(`Unknown local tool: ${name}`);
}

async function audit(event) {
  await mkdir(AUDIT_DIR, { recursive: true });
  await appendFile(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', 'utf8');
}

export class McpRouter {
  constructor(config, root = process.env.BHARATSHOP_ROOT || PROJECT_ROOT) {
    this.config = config;
    this.root = resolve(root);
    this.clients = new Map();
  }

  connector(name) {
    const cfg = this.config.connectors[name];
    if (!cfg || cfg.enabled === false) throw new Error(`Unknown or disabled MCP connector: ${name}`);
    return cfg;
  }

  client(name) {
    const cfg = this.connector(name);
    if (cfg.type !== 'http') throw new Error(`Connector ${name} is not an HTTP MCP connector.`);
    if (!this.clients.has(name)) this.clients.set(name, new HttpMcpClient(name, cfg));
    return this.clients.get(name);
  }

  async status({ probe = false } = {}) {
    const output = [];
    for (const [name, cfg] of Object.entries(this.config.connectors)) {
      if (cfg.enabled === false) { output.push({ name, state: 'DISABLED', readOnly: cfg.readOnly === true }); continue; }
      if (cfg.type === 'builtin') { output.push({ name, state: 'CONFIGURED', readOnly: true, tools: localToolDefinitions().length }); continue; }
      if (cfg.authEnv && !process.env[cfg.authEnv]) { output.push({ name, state: 'AUTH_REQUIRED', readOnly: true, authEnv: cfg.authEnv }); continue; }
      if (!probe) { output.push({ name, state: 'CONFIGURED', readOnly: true }); continue; }
      try {
        const tools = await this.client(name).listTools();
        output.push({ name, state: 'VERIFIED', readOnly: true, tools: tools.length });
      } catch (error) {
        output.push({ name, state: 'FAILED', readOnly: true, error: redactText(error.message) });
      }
    }
    return output;
  }

  async tools(name = 'all', { probe = true } = {}) {
    const result = [];
    const names = name === 'all' ? Object.keys(this.config.connectors) : [name];
    for (const connectorName of names) {
      const cfg = this.connector(connectorName);
      if (cfg.type === 'builtin') {
        result.push(...localToolDefinitions().map(tool => ({ connector: connectorName, ...tool })));
        continue;
      }
      if (!probe && cfg.authEnv && !process.env[cfg.authEnv]) continue;
      const tools = await this.client(connectorName).listTools();
      result.push(...tools.map(tool => ({ connector: connectorName, ...tool })));
    }
    return result;
  }

  async modelTools() {
    const tools = await this.tools('all', { probe: true });
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: `${tool.connector}__${tool.name}`.replace(/[^A-Za-z0-9_-]/g, '_'),
        description: `[${tool.connector}; read-only] ${tool.description || tool.name}`,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  async callModelTool(modelName, args = {}) {
    const split = String(modelName).indexOf('__');
    if (split < 1) throw new Error('Invalid MCP model tool name.');
    return this.callTool(modelName.slice(0, split), modelName.slice(split + 2), args);
  }

  async callTool(connectorName, toolName, args = {}) {
    const cfg = this.connector(connectorName);
    const started = Date.now();
    let ok = false;
    try {
      if (cfg.readOnly !== true) throw new Error('Connector is not locked read-only.');
      if (cfg.type === 'builtin') {
        if (!localToolDefinitions().some(tool => tool.name === toolName)) throw new Error(`Unknown local tool: ${toolName}`);
        const value = await callLocalTool(this.root, toolName, args);
        ok = true;
        return value;
      }
      if (isWriteLikeTool(toolName)) throw new Error(`Blocked write-like MCP tool in read-only mode: ${toolName}`);
      const value = await this.client(connectorName).callTool(toolName, args);
      ok = true;
      return value;
    } finally {
      await audit({ connector: connectorName, tool: toolName, argumentKeys: Object.keys(args || {}), ok, durationMs: Date.now() - started });
    }
  }
}

export async function createMcpRouter(options = {}) {
  return new McpRouter(await loadMcpConfig(options.configPath), options.root);
}

async function cli() {
  const [command = 'status', connector = 'all'] = process.argv.slice(2);
  const router = await createMcpRouter();
  if (command === 'status') {
    console.log(JSON.stringify(await router.status({ probe: process.argv.includes('--probe') }), null, 2));
    return;
  }
  if (command === 'tools') {
    console.log(JSON.stringify((await router.tools(connector, { probe: true })).map(({ connector: c, name, description }) => ({ connector: c, name, description })), null, 2));
    return;
  }
  if (command === 'test') {
    const status = await router.status({ probe: true });
    console.log(JSON.stringify(connector === 'all' ? status : status.filter(item => item.name === connector), null, 2));
    return;
  }
  throw new Error('Usage: node scripts/mcp-router.mjs status [--probe] | tools [connector] | test [connector]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(error => { console.error(redactText(error.message)); process.exitCode = 1; });
}
