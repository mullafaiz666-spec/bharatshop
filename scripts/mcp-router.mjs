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
const AUDIT_FILE = join(homedir(), '.bharatshop-ai', 'mcp-audit.jsonl');
const DEFAULT_TIMEOUT_MS = 20_000;

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
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) return target;
  throw new Error('Path escapes BharatShop project sandbox.');
}

export function isWriteLikeTool(name) {
  return /(^|_)(create|update|delete|remove|merge|deploy|push|commit|apply|reset|pause|restore|upload|publish|write|insert|upsert|drop|truncate|reseed|migrate|cancel|close|lock|unlock|rerun|dismiss|resolve|unresolve|approve|assign|label)(_|$)/i.test(String(name));
}

function missingEnv(config) {
  return (config.requiredEnv || []).filter(key => !process.env[key]);
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
      headers: Object.fromEntries(Object.entries(raw.headers || {}).map(([key, value]) => [key, envExpand(value)])),
    };
    const cfg = connectors[name];
    if (cfg.enabled !== false && cfg.readOnly !== true) throw new Error(`Connector ${name} must be readOnly=true in Machine AI.`);
    if (cfg.type === 'http' && !/^https:\/\//i.test(cfg.url || '')) throw new Error(`Connector ${name} must use HTTPS.`);
  }
  return { ...parsed, connectors, configPath };
}

function parseSse(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try { out.push(JSON.parse(data)); } catch {}
  }
  return out;
}

class HttpMcpClient {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.sessionId = null;
    this.connected = false;
    this.id = 0;
  }

  headers() {
    const headers = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...this.config.headers,
    };
    const missing = missingEnv(this.config);
    if (missing.length) throw new Error(`MISSING_ENV:${missing.join(',')}`);
    if (this.config.authEnv) headers.authorization = `Bearer ${process.env[this.config.authEnv]}`;
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    return headers;
  }

  async post(body, { timeoutMs = DEFAULT_TIMEOUT_MS, allowEmpty = false } = {}) {
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const session = response.headers.get('mcp-session-id');
    if (session) this.sessionId = session;
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP_${response.status}:${redactText(text).slice(0, 300)}`);
    if (!text.trim()) {
      if (allowEmpty) return null;
      throw new Error('Empty MCP response.');
    }
    const contentType = response.headers.get('content-type') || '';
    const messages = contentType.includes('text/event-stream') ? parseSse(text) : [JSON.parse(text)];
    const message = messages.find(item => item?.id === body.id) || messages.at(-1);
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
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd, timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  });
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
  const empty = { type: 'object', properties: {}, additionalProperties: false };
  return [
    { name: 'project_status', description: 'Read project root and current Git branch/status.', inputSchema: empty },
    { name: 'git_status', description: 'Read git status for the BharatShop project.', inputSchema: empty },
    { name: 'git_diff', description: 'Read the current git diff without modifying files.', inputSchema: empty },
    { name: 'git_log', description: 'Read recent git commits.', inputSchema: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false } },
    { name: 'list_project_files', description: 'List project files inside the BharatShop sandbox.', inputSchema: empty },
    { name: 'read_project_file', description: 'Read a UTF-8 text file inside the BharatShop sandbox.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
    { name: 'npm_test', description: 'Run BharatShop integration tests locally. This does not deploy.', inputSchema: empty },
    { name: 'npm_build', description: 'Run the local BharatShop production build. This writes local build artifacts only.', inputSchema: empty },
    { name: 'ollama_health', description: 'Check local Ollama model endpoint health.', inputSchema: empty },
    { name: 'machine_ai_health', description: 'Check the local Machine AI web endpoint.', inputSchema: empty },
    { name: 'queue_status', description: 'Inspect local Machine AI queue directory counts.', inputSchema: empty },
  ];
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
    const base = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8_000) });
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
  try {
    await mkdir(dirname(AUDIT_FILE), { recursive: true });
    await appendFile(AUDIT_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
  } catch {
    // Audit persistence must never turn a completed read-only tool call into a false failure.
  }
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
      if (cfg.type === 'builtin') { output.push({ name, state: probe ? 'VERIFIED' : 'CONFIGURED', readOnly: true, tools: localToolDefinitions().length }); continue; }
      const missing = missingEnv(cfg);
      if (missing.length) { output.push({ name, state: 'MISSING_ENV', readOnly: true, missing }); continue; }
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

  async tools(name = 'all', { probe = true, skipUnavailable = false } = {}) {
    const result = [];
    const names = name === 'all' ? Object.keys(this.config.connectors) : [name];
    for (const connectorName of names) {
      const cfg = this.connector(connectorName);
      if (cfg.type === 'builtin') {
        result.push(...localToolDefinitions().map(tool => ({ connector: connectorName, ...tool })));
        continue;
      }
      const missing = missingEnv(cfg);
      if (missing.length) {
        if (skipUnavailable) continue;
        throw new Error(`MISSING_ENV:${connectorName}:${missing.join(',')}`);
      }
      if (!probe) continue;
      try {
        const tools = await this.client(connectorName).listTools();
        result.push(...tools.map(tool => ({ connector: connectorName, ...tool })));
      } catch (error) {
        if (!skipUnavailable) throw error;
      }
    }
    return result;
  }

  async modelTools() {
    const tools = await this.tools('all', { probe: true, skipUnavailable: true });
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
      const missing = missingEnv(cfg);
      if (missing.length) throw new Error(`MISSING_ENV:${connectorName}:${missing.join(',')}`);
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
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const connector = args.find(value => !value.startsWith('--') && value !== command) || 'all';
  const router = await createMcpRouter();
  if (command === 'status') {
    console.log(JSON.stringify(await router.status({ probe: args.includes('--probe') }), null, 2));
    return;
  }
  if (command === 'tools') {
    const tools = await router.tools(connector, { probe: true, skipUnavailable: connector === 'all' });
    console.log(JSON.stringify(tools.map(({ connector: c, name, description }) => ({ connector: c, name, description })), null, 2));
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
