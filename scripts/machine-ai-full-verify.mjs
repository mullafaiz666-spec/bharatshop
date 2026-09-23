#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const manager = join(root, 'scripts', 'machine-ai-web-manager.mjs');
const port = Number(process.env.BHARATSHOP_MACHINE_UI_PORT || '3002');
const base = `http://127.0.0.1:${port}`;

function safeEnv() {
  const env = { ...process.env, CI: '1' };
  for (const key of Object.keys(env)) {
    if (/(?:DATABASE|POSTGRES|PGHOST|PGUSER|PGPASSWORD|SUPABASE|RAZORPAY|CASHFREE|SHOPIFY|SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?KEY)/i.test(key)) delete env[key];
  }
  return env;
}

function run(name, command, args, timeout = 30 * 60_000) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 24 * 1024 * 1024,
    env: safeEnv(),
  });
  return {
    name,
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - started,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim().slice(-8000),
    error: result.error?.message || '',
  };
}

async function json(path, options = {}, timeout = 12_000) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store',
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${text.slice(0, 500)}`);
  return payload;
}

async function chat(mode, prompt, timeout = 300_000) {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, messages: [{ role: 'user', content: prompt }], selectedAgents: [] }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`chat HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  const events = text.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { type: 'malformed', raw: line }; }
  });
  const error = events.find(event => event.type === 'error');
  if (error) throw new Error(error.error || 'Machine AI chat returned an error');
  return {
    events,
    answer: events.filter(event => event.type === 'delta').map(event => event.text || '').join('').trim(),
  };
}

const report = {
  startedAt: new Date().toISOString(),
  root,
  port,
  runtime: {},
  roles: {},
  checks: [],
};

try {
  report.checks.push(run('machine-ui-start', process.execPath, [manager, 'start'], 45_000));

  const identity = await json('/api/identity');
  const status = await json('/api/status');
  const operations = await json('/api/operations');

  report.runtime.identity = identity;
  report.runtime.model = status?.model;
  report.runtime.ollamaReady = Boolean(status?.ollama?.ready);
  report.runtime.modelInstalled = Boolean(status?.ollama?.modelInstalled);
  report.runtime.supervisor = status?.supervisor?.state || 'UNKNOWN';
  report.runtime.agents = status?.agents ?? 0;

  report.roles.chat = await chat('chat', 'Reply with a short confirmation that local chat is operational.');
  report.roles.status = await chat('chat', 'Check my BharatShop project status', 30_000);

  const engineer = Array.isArray(operations?.actions)
    ? operations.actions.find(action => action.id === 'engineer-task')
    : null;
  report.roles.coding = {
    available: Boolean(engineer),
    approvalRequired: engineer?.approvalRequired ?? null,
  };
  report.roles.executive = {
    localProjectAutonomy: Boolean(operations?.authority?.localProjectAutonomy),
    buildsAndTests: Boolean(operations?.authority?.buildsAndTests),
    localServiceControl: Boolean(operations?.authority?.localServiceControl),
  };

  const engineerStatus = await json('/api/operations', {
    method: 'POST',
    body: JSON.stringify({ action: 'engineer-status', approved: true }),
  }, 60_000);
  report.roles.engineerStatus = engineerStatus?.result || null;

  report.checks.push(run('git-diff-check', 'git', ['diff', '--check'], 60_000));
  report.checks.push(run('typecheck', npm, ['run', 'typecheck'], 20 * 60_000));
  report.checks.push(run('integration-tests', npm, ['run', 'test:integrations'], 25 * 60_000));
  report.checks.push(run('lint', npm, ['run', 'lint'], 20 * 60_000));
  report.checks.push(run('production-build', npm, ['run', 'build'], 30 * 60_000));

  const required = [
    report.runtime.ollamaReady,
    report.runtime.modelInstalled,
    Boolean(report.roles.chat.answer),
    /LOCAL READ-ONLY AUDIT/.test(report.roles.status.answer),
    report.roles.coding.available && report.roles.coding.approvalRequired === false,
    report.roles.executive.localProjectAutonomy,
    report.checks.every(check => check.ok),
  ];
  report.ok = required.every(Boolean);
} catch (error) {
  report.ok = false;
  report.fatal = error instanceof Error ? error.message : String(error);
}

report.finishedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
