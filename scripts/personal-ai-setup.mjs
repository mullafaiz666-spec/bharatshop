#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const AI_HOME = process.env.PERSONAL_AI_HOME || join(homedir(), '.bharatshop-ai');
const BROWSER_HOME = join(AI_HOME, 'browser-use');
const BROWSER_VENV = join(BROWSER_HOME, '.venv');
const MEMORY_FILE = join(AI_HOME, 'memory.jsonl');
const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'qwen3.5:4b';
const BROWSER_USE_VERSION = '0.13.4';
const PIXVERSE_VERSION = '1.4.3';

mkdirSync(AI_HOME, { recursive: true });
mkdirSync(BROWSER_HOME, { recursive: true });

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: options.stdio || 'inherit',
    encoding: options.stdio === 'pipe' ? 'utf8' : undefined,
    windowsHide: false,
    timeout: options.timeout,
    env: options.env || process.env,
  });
  if (result.error) {
    if (!options.quiet) console.error(result.error.message);
    return { status: 1, stdout: '', stderr: result.error.message };
  }
  return {
    status: result.status ?? 1,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

function capture(command, args = [], options = {}) {
  return run(command, args, { ...options, stdio: 'pipe', quiet: true });
}

function executablePath(name) {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = capture(finder, [name]);
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) || null;
}

function ollamaPath() {
  const direct = executablePath(process.platform === 'win32' ? 'ollama.exe' : 'ollama');
  if (direct) return direct;
  if (process.platform !== 'win32') return null;
  const candidates = [
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
  ];
  return candidates.find(path => path && existsSync(path)) || null;
}

function npmCliPath() {
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  return candidates.find(candidate => candidate && existsSync(candidate)) || null;
}

function globalNodeModules() {
  const npmCli = npmCliPath();
  if (!npmCli) return null;
  const result = capture(process.execPath, [npmCli, 'root', '--global']);
  return result.status === 0 ? result.stdout.trim() : null;
}

function pixverseInstalled() {
  const root = globalNodeModules();
  return Boolean(root && existsSync(join(root, 'pixverse', 'package.json')));
}

function venvPython() {
  const path = process.platform === 'win32'
    ? join(BROWSER_VENV, 'Scripts', 'python.exe')
    : join(BROWSER_VENV, 'bin', 'python');
  return existsSync(path) ? path : null;
}

function discoverPython() {
  if (process.platform === 'win32') {
    const py = executablePath('py.exe');
    if (py) {
      const result = capture(py, ['-3', '-c', 'import sys; print(sys.executable)']);
      if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
    }
  }
  for (const name of process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python']) {
    const path = executablePath(name);
    if (!path) continue;
    const result = capture(path, ['-c', 'import sys; print(sys.version_info[:2] >= (3, 11))']);
    if (result.status === 0 && /True/.test(result.stdout)) return path;
  }
  return null;
}

function ensurePython() {
  let python = discoverPython();
  if (python) return python;
  if (process.platform !== 'win32') throw new Error('Python 3.11+ is required for Browser Use.');
  const winget = executablePath('winget.exe');
  if (!winget) throw new Error('Python 3.11+ is missing and winget is unavailable.');
  console.log('\nInstalling Python 3.12 for Browser Use...');
  const result = run(winget, ['install', '--id', 'Python.Python.3.12', '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements']);
  if (result.status !== 0) throw new Error('Python 3.12 installation failed.');
  python = discoverPython();
  if (!python) throw new Error('Python installed but is not visible yet. Reopen PowerShell and rerun npm.cmd run ai:setup.');
  return python;
}

function setupAgency() {
  console.log('=== BharatShop Personal AI — free/local setup ===');
  console.log(`Local model: ${MODEL}`);
  const result = run(process.execPath, [join(ROOT, 'scripts', 'local-agency.mjs'), 'setup']);
  if (result.status !== 0) throw new Error('Local Agency/Ollama setup failed.');
}

function setupBrowserUse() {
  let python = venvPython();
  if (!python) {
    const hostPython = ensurePython();
    console.log('\nCreating isolated Browser Use environment...');
    const result = run(hostPython, ['-m', 'venv', BROWSER_VENV]);
    if (result.status !== 0) throw new Error('Could not create Browser Use virtual environment.');
    python = venvPython();
  }
  if (!python) throw new Error('Browser Use virtual environment is missing.');

  console.log(`Installing Browser Use ${BROWSER_USE_VERSION} + Playwright...`);
  if (run(python, ['-m', 'pip', 'install', '--upgrade', 'pip']).status !== 0) throw new Error('pip upgrade failed.');
  if (run(python, ['-m', 'pip', 'install', `browser-use==${BROWSER_USE_VERSION}`, 'playwright']).status !== 0) {
    throw new Error('Browser Use/Playwright installation failed.');
  }
  console.log('Installing local Chromium for Browser Use...');
  if (run(python, ['-m', 'playwright', 'install', 'chromium']).status !== 0) throw new Error('Chromium installation failed.');
}

function setupHarnessLocal() {
  const ollama = ollamaPath();
  if (!ollama) throw new Error('Ollama was not found after local Agency setup.');
  console.log(`\nConfiguring DeepSeek Harness explicitly on local model ${MODEL}...`);
  console.log('Cloud models and paid Ollama web search are not selected by this setup.');
  const result = run(ollama, ['launch', 'dsh', '--model', MODEL, '--config'], { stdio: 'pipe', timeout: 120000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`DeepSeek Harness local configuration failed. Verify "ollama list" contains ${MODEL} and update Ollama if needed.`);
  }
  const settings = join(homedir(), '.ollama', 'launch', 'dsh', 'settings.yaml');
  if (!existsSync(settings)) throw new Error('Ollama completed but did not create DeepSeek Harness settings.yaml.');
  const text = readFileSync(settings, 'utf8');
  if (!text.includes(MODEL)) throw new Error(`DeepSeek Harness settings were created but do not select local model ${MODEL}.`);
}

function setupPixVerseConnector() {
  if (pixverseInstalled()) return;
  const npmCli = npmCliPath();
  if (!npmCli) {
    console.log('PixVerse connector: npm CLI could not be resolved; skipping optional connector install.');
    return;
  }
  console.log(`\nInstalling PixVerse CLI ${PIXVERSE_VERSION} connector...`);
  console.log('PixVerse generation remains external and can require provider credits; this setup never enables spending automatically.');
  const result = run(process.execPath, [npmCli, 'install', '--global', `pixverse@${PIXVERSE_VERSION}`]);
  if (result.status !== 0) console.log('PixVerse CLI install did not complete; local Personal AI still works without it.');
}

function ensureMemory() {
  if (existsSync(MEMORY_FILE)) return;
  const result = run(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(MEMORY_FILE)}, '')`]);
  if (result.status !== 0) throw new Error('Could not initialize local Personal AI memory file.');
}

function printStatus() {
  console.log('\nCore local setup complete. Checking capability matrix...\n');
  const result = run(process.execPath, [join(ROOT, 'scripts', 'personal-ai.mjs'), 'status']);
  if (result.status !== 0) throw new Error('Capability status check failed.');
}

try {
  setupAgency();
  setupBrowserUse();
  setupHarnessLocal();
  setupPixVerseConnector();
  ensureMemory();
  printStatus();
} catch (error) {
  console.error(`Personal AI setup error: ${error.message}`);
  process.exit(1);
}
