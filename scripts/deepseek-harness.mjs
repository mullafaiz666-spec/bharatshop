#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_DSH_VERSION = '0.1.1-rc.2';
const DSH_VERSION = process.env.DSH_VERSION || DEFAULT_DSH_VERSION;
const DSH_HOME = process.env.DSH_HOME || join(ROOT, '.runtime', 'deepseek-harness');
const mode = (process.argv[2] || 'status').toLowerCase();
const args = process.argv.slice(3);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dsh = process.platform === 'win32' ? 'dsh.cmd' : 'dsh';
const ollama = process.platform === 'win32' ? 'ollama.exe' : 'ollama';

function parseNodeVersion() {
  const [major = 0, minor = 0, patch = 0] = process.versions.node.split('.').map(Number);
  return { major, minor, patch };
}

function nodeIsSupported() {
  const { major, minor } = parseNodeVersion();
  return major >= 24 || (major === 22 && minor >= 19);
}

function assertSupportedNode() {
  if (nodeIsSupported()) return;
  console.error(`DeepSeek Harness requires Node.js 22.19+ (or 24+). Current Node: ${process.versions.node}`);
  console.error('Upgrade Node first, then rerun this command. BharatShop production remains untouched.');
  process.exit(2);
}

function commandResult(command, commandArgs = []) {
  return spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
  });
}

function hasCommand(command, commandArgs = ['--version']) {
  const result = commandResult(command, commandArgs);
  return !result.error && result.status === 0;
}

function safeHarnessEnv() {
  const allowed = new Set([
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
    'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
    'TMP', 'TEMP', 'TMPDIR', 'SHELL', 'TERM', 'COLORTERM', 'LANG', 'LC_ALL',
    'OLLAMA_HOST', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  ]);
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key) && typeof value === 'string') env[key] = value;
  }
  env.DSH_HOME = DSH_HOME;
  env.BHARATSHOP_DSH_GUARDED = '1';
  return env;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: false,
    env: options.env || process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exitCode = result.status ?? 1;
  return result.status ?? 1;
}

function npxDsh(dshArgs, env = safeHarnessEnv()) {
  mkdirSync(DSH_HOME, { recursive: true });
  return run(npx, ['--yes', `@deepseek-ai/dsh@${DSH_VERSION}`, ...dshArgs], { env });
}

function printStatus() {
  const node = parseNodeVersion();
  console.log('=== BharatShop DeepSeek Harness status ===');
  console.log(`workspace: ${ROOT}`);
  console.log(`DSH_HOME: ${DSH_HOME}`);
  console.log(`pinned DSH: ${DSH_VERSION}`);
  console.log(`Node: ${process.versions.node} (${nodeIsSupported() ? 'READY' : 'UPGRADE REQUIRED'})`);

  const dshVersion = commandResult(dsh, ['--version']);
  console.log(`global dsh: ${dshVersion.status === 0 ? (dshVersion.stdout || '').trim() || 'installed' : 'not installed (npx launcher still supported)'}`);

  const ollamaVersion = commandResult(ollama, ['--version']);
  console.log(`Ollama: ${ollamaVersion.status === 0 ? (ollamaVersion.stdout || ollamaVersion.stderr || '').trim() || 'installed' : 'not detected'}`);

  const localEnv = join(ROOT, '.env.local');
  if (existsSync(localEnv)) {
    console.log('Safety: .env.local exists in this checkout. The launcher removes ambient secrets from the Harness process, but the agent can still read workspace files. Do not authorize it to inspect .env files.');
  }

  if (!nodeIsSupported()) {
    console.log('Next: upgrade Node to 22.19+ or 24+, then run: node scripts/deepseek-harness.mjs install');
  } else {
    console.log('Next: node scripts/deepseek-harness.mjs install');
  }
}

function readGuardrails() {
  const promptPath = join(ROOT, 'agents', 'DEEPSEEK_SYSTEM_AGENT.md');
  if (!existsSync(promptPath)) return '';
  return readFileSync(promptPath, 'utf8').trim();
}

switch (mode) {
  case 'status':
    printStatus();
    break;

  case 'install':
    assertSupportedNode();
    mkdirSync(DSH_HOME, { recursive: true });
    console.log(`Installing @deepseek-ai/dsh@${DSH_VERSION} globally...`);
    run(npm, ['install', '--global', `@deepseek-ai/dsh@${DSH_VERSION}`]);
    if (process.exitCode === 0) {
      console.log('DeepSeek Harness installed. Run: node scripts/deepseek-harness.mjs web');
    }
    break;

  case 'web': {
    assertSupportedNode();
    const portIndex = args.indexOf('--port');
    const port = portIndex >= 0 && args[portIndex + 1] ? args[portIndex + 1] : (process.env.DSH_PORT || '3080');
    console.log(`Starting DeepSeek Harness for BharatShop at http://127.0.0.1:${port}`);
    console.log('Use a local Ollama/OpenAI-compatible provider in Settings -> Models. Keep production credentials out of the workspace session.');
    npxDsh(['web', '--host', '127.0.0.1', '--port', port, '--no-open']);
    break;
  }

  case 'task': {
    assertSupportedNode();
    const task = args.join(' ').trim();
    if (!task) {
      console.error('Usage: node scripts/deepseek-harness.mjs task "your task"');
      process.exit(2);
    }
    const guardrails = readGuardrails();
    const prompt = `${guardrails}\n\nCURRENT TASK\n${task}`.trim();
    console.log('Running one guarded DeepSeek Harness headless task in the BharatShop workspace...');
    npxDsh(['--profile', 'headless', prompt]);
    break;
  }

  default:
    console.error('Unknown mode. Use: status | install | web | task');
    process.exit(2);
}
