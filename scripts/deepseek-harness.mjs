#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_DSH_VERSION = '0.1.5-rc.2';
const DSH_VERSION = process.env.DSH_VERSION || DEFAULT_DSH_VERSION;
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh-bharatshop');
const PRESET_ID = 'bharatshop-system';
const PRESET_SOURCE = join(ROOT, 'harness', 'presets', PRESET_ID);
const PRESET_TARGET = join(DSH_HOME, '.agent-presets', PRESET_ID);
const HEADLESS_SUBAGENT_PATCH = join(ROOT, 'harness', 'patches', 'headless-product-subagents.patch.yml');
const PRODUCT_BUNDLES = [
  '@deepseek-ai/dsh-subagent-codex',
  '@deepseek-ai/dsh-subagent-claude-code',
];
const PRODUCT_PROFILES = ['web', 'headless'];
const LOCAL_TOOLS_HOME = process.env.BHARATSHOP_TOOLS_HOME || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BharatShop', 'Tools');
const LOCAL_TOOLS_BIN = join(LOCAL_TOOLS_HOME, 'node_modules', '.bin');
const PNPM_SPEC = process.env.BHARATSHOP_PNPM_SPEC || 'pnpm@10';
const LOCAL_ENGINEER_MODEL = process.env.BHARATSHOP_LOCAL_ENGINEER_MODEL || process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'qwen3.5:4b';
const LOCAL_OLLAMA_OPENAI_BASE_URL = process.env.BHARATSHOP_OLLAMA_OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1';
const SETTINGS_PATH = join(DSH_HOME, 'settings.yaml');

const mode = (process.argv[2] || 'status').toLowerCase();
const args = process.argv.slice(3);
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

function commandResult(command, commandArgs = [], env = process.env) {
  return spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env,
  });
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
  // Ollama's OpenAI-compatible endpoint ignores the key value, but current DSH
  // requires a named apiKeyEnv reference on Windows. This is a local placeholder,
  // not a credential and is never written to the repository.
  env.OLLAMA_API_KEY = 'ollama-local';
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
    return 1;
  }
  return result.status ?? 1;
}

function runOrExit(command, commandArgs, options = {}) {
  const status = run(command, commandArgs, options);
  if (status !== 0) process.exit(status);
}

function resolveNpmCli(kind) {
  const filename = kind === 'npx' ? 'npx-cli.js' : 'npm-cli.js';
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    const candidate = join(dirname(npmExecPath), filename);
    if (existsSync(candidate)) return candidate;
  }

  const bundledCandidate = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', filename);
  if (existsSync(bundledCandidate)) return bundledCandidate;

  return null;
}

function runPackageCli(kind, cliArgs, options = {}) {
  if (process.platform !== 'win32') {
    return run(kind, cliArgs, options);
  }

  const cliPath = resolveNpmCli(kind);
  if (!cliPath) {
    console.error(`Could not locate ${kind}-cli.js next to the active Node.js installation.`);
    console.error(`Node executable: ${process.execPath}`);
    console.error('Repair or reinstall Node.js/npm, then rerun this command.');
    return 1;
  }

  return run(process.execPath, [cliPath, ...cliArgs], options);
}

function runPackageCliOrExit(kind, cliArgs, options = {}) {
  const status = runPackageCli(kind, cliArgs, options);
  if (status !== 0) process.exit(status);
}

function withLocalToolPath(env = safeHarnessEnv()) {
  const next = { ...env };
  const separator = process.platform === 'win32' ? ';' : ':';
  const existing = next.Path || next.PATH || '';
  const combined = [LOCAL_TOOLS_BIN, existing].filter(Boolean).join(separator);
  if (process.platform === 'win32') next.Path = combined;
  next.PATH = combined;
  return next;
}

function pnpmAvailable(env = withLocalToolPath(safeHarnessEnv())) {
  if (process.platform === 'win32') {
    const result = commandResult('where.exe', ['pnpm'], env);
    return result.status === 0;
  }
  const result = commandResult('sh', ['-lc', 'command -v pnpm >/dev/null 2>&1'], env);
  return result.status === 0;
}

function ensurePnpmEnv() {
  let env = withLocalToolPath(safeHarnessEnv());
  if (pnpmAvailable(env)) return env;

  console.log(`pnpm was not found. Installing ${PNPM_SPEC} into BharatShop local tools...`);
  mkdirSync(LOCAL_TOOLS_HOME, { recursive: true });
  runPackageCliOrExit('npm', [
    'install',
    '--prefix', LOCAL_TOOLS_HOME,
    '--no-audit',
    '--no-fund',
    '--save-exact',
    PNPM_SPEC,
  ], { env: safeHarnessEnv() });

  env = withLocalToolPath(safeHarnessEnv());
  if (!pnpmAvailable(env)) {
    console.error(`pnpm bootstrap completed but pnpm is still unavailable from ${LOCAL_TOOLS_BIN}.`);
    process.exit(2);
  }
  console.log(`pnpm ready from BharatShop local tools: ${LOCAL_TOOLS_BIN}`);
  return env;
}

function npxDsh(dshArgs, env = withLocalToolPath(safeHarnessEnv())) {
  mkdirSync(DSH_HOME, { recursive: true });
  return runPackageCli('npx', ['--yes', `@deepseek-ai/dsh@${DSH_VERSION}`, ...dshArgs], { env });
}

function npxDshOrExit(dshArgs, env = withLocalToolPath(safeHarnessEnv())) {
  const status = npxDsh(dshArgs, env);
  if (status !== 0) process.exit(status);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function profileManifest(profile) {
  return readJson(join(DSH_HOME, 'profiles', profile, 'package.json'));
}

function profileHasBundle(profile, packageName) {
  const manifest = profileManifest(profile);
  return Boolean(manifest?.dependencies?.[packageName]);
}

function profileProductsReady(profile) {
  return PRODUCT_BUNDLES.every(packageName => profileHasBundle(profile, packageName));
}


function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function ensureLocalOllamaSettings() {
  mkdirSync(DSH_HOME, { recursive: true });

  const listed = commandResult(ollama, ['list'], withLocalToolPath(safeHarnessEnv()));
  if (listed.status !== 0) {
    console.error('Local Ollama is unavailable. Start Ollama before running Machine Engineer.');
    process.exit(2);
  }
  const inventory = `${listed.stdout || ''}\n${listed.stderr || ''}`;
  if (!inventory.includes(LOCAL_ENGINEER_MODEL)) {
    console.error(`Local engineering model "${LOCAL_ENGINEER_MODEL}" is not installed in Ollama.`);
    console.error(`Install it first with: ollama pull ${LOCAL_ENGINEER_MODEL}`);
    process.exit(2);
  }

  const managedMarker = '# managed-by: bharatshop-local-engineer';
  if (existsSync(SETTINGS_PATH)) {
    const current = readFileSync(SETTINGS_PATH, 'utf8');
    if (!current.includes(managedMarker)) {
      const backupPath = join(DSH_HOME, `settings.before-bharatshop-local-${Date.now()}.yaml`);
      cpSync(SETTINGS_PATH, backupPath);
      console.log(`Backed up existing Harness settings: ${backupPath}`);
    }
  }

  const settings = [
    managedMarker,
    'llm-pi-ai:',
    '  providers:',
    '    ollama:',
    '      displayName: "Ollama Local"',
    '      apiKeyEnv: OLLAMA_API_KEY',
    '      api: openai-completions',
    `      baseURL: ${yamlScalar(LOCAL_OLLAMA_OPENAI_BASE_URL)}`,
    '      models:',
    `        - id: ${yamlScalar(LOCAL_ENGINEER_MODEL)}`,
    'agent-default-model:',
    '  provider: ollama',
    `  model: ${yamlScalar(LOCAL_ENGINEER_MODEL)}`,
    '',
  ].join('\n');
  writeFileSync(SETTINGS_PATH, settings, 'utf8');
  return { provider: 'ollama', model: LOCAL_ENGINEER_MODEL, baseURL: LOCAL_OLLAMA_OPENAI_BASE_URL };
}

function installPreset({ refresh = false } = {}) {
  if (!existsSync(PRESET_SOURCE)) {
    console.error(`BharatShop Harness preset source is missing: ${PRESET_SOURCE}`);
    process.exit(2);
  }
  if (existsSync(PRESET_TARGET)) {
    if (!refresh) {
      console.log(`Preset already present: ${PRESET_TARGET}`);
      console.log('Use `subagents --refresh-preset` only when you intentionally want to replace the local preset copy.');
      return;
    }
    rmSync(PRESET_TARGET, { recursive: true, force: true });
  }
  mkdirSync(dirname(PRESET_TARGET), { recursive: true });
  cpSync(PRESET_SOURCE, PRESET_TARGET, { recursive: true });
  console.log(`Installed BharatShop Harness preset: ${PRESET_TARGET}`);
}

function assertProductSetup({ requirePreset = false, profile } = {}) {
  const missing = [];
  if (profile && !profileProductsReady(profile)) missing.push(`${profile} product bundles`);
  if (requirePreset && !existsSync(join(PRESET_TARGET, 'agent.cordis.yml'))) missing.push('BharatShop System Agent preset');
  if (missing.length === 0) return;
  console.error(`DeepSeek Harness subagent setup is incomplete: ${missing.join(', ')}.`);
  console.error('Run: node scripts/deepseek-harness.mjs subagents');
  process.exit(2);
}

function globalDshStatus() {
  if (process.platform === 'win32') {
    const where = commandResult('where.exe', ['dsh']);
    return where.status === 0 ? 'installed' : 'not installed (npx launcher still supported)';
  }

  const dshVersion = commandResult('dsh', ['--version']);
  return dshVersion.status === 0
    ? (dshVersion.stdout || '').trim() || 'installed'
    : 'not installed (npx launcher still supported)';
}

function printStatus() {
  console.log('=== BharatShop DeepSeek Harness status ===');
  console.log(`workspace: ${ROOT}`);
  console.log(`DSH_HOME: ${DSH_HOME}`);
  console.log(`pinned DSH: ${DSH_VERSION}`);
  console.log(`Node: ${process.versions.node} (${nodeIsSupported() ? 'READY' : 'UPGRADE REQUIRED'})`);
  console.log(`global dsh: ${globalDshStatus()}`);
  console.log(`pnpm: ${pnpmAvailable() ? 'READY' : 'NOT INSTALLED (subagents will bootstrap locally)'}`);

  const ollamaVersion = commandResult(ollama, ['--version']);
  console.log(`Ollama: ${ollamaVersion.status === 0 ? (ollamaVersion.stdout || ollamaVersion.stderr || '').trim() || 'installed' : 'not detected'}`);

  for (const profile of PRODUCT_PROFILES) {
    const codex = profileHasBundle(profile, PRODUCT_BUNDLES[0]);
    const claude = profileHasBundle(profile, PRODUCT_BUNDLES[1]);
    console.log(`${profile} subagents: Codex=${codex ? 'READY' : 'NOT INSTALLED'} | Claude Code=${claude ? 'READY' : 'NOT INSTALLED'}`);
  }

  console.log(`BharatShop preset: ${existsSync(join(PRESET_TARGET, 'agent.cordis.yml')) ? 'READY' : 'NOT INSTALLED'}`);
  console.log(`Headless subagent patch: ${existsSync(HEADLESS_SUBAGENT_PATCH) ? 'READY' : 'MISSING'}`);
  console.log(`Engineering parent model: Ollama ${LOCAL_ENGINEER_MODEL} (local/free)`);

  const localEnv = join(ROOT, '.env.local');
  if (existsSync(localEnv)) {
    console.log('Safety: .env.local exists in this checkout. Harness state is kept outside the repo, but coding agents can still read workspace files. Never authorize credential-file inspection.');
  }

  if (!nodeIsSupported()) {
    console.log('Next: upgrade Node to 22.19+ or 24+, then run: node scripts/deepseek-harness.mjs install');
  } else if (!PRODUCT_PROFILES.every(profileProductsReady) || !existsSync(join(PRESET_TARGET, 'agent.cordis.yml'))) {
    console.log('Next: node scripts/deepseek-harness.mjs subagents');
  } else {
    console.log('Next: node scripts/deepseek-harness.mjs web');
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
    runPackageCliOrExit('npm', ['install', '--global', `@deepseek-ai/dsh@${DSH_VERSION}`], { env: safeHarnessEnv() });
    console.log('DeepSeek Harness installed.');
    console.log('Next: node scripts/deepseek-harness.mjs subagents');
    break;

  case 'subagents': {
    assertSupportedNode();
    const refreshPreset = args.includes('--refresh-preset');
    mkdirSync(DSH_HOME, { recursive: true });
    const harnessEnv = ensurePnpmEnv();

    for (const profile of PRODUCT_PROFILES) {
      console.log(`Configuring official product subagents in Harness profile: ${profile}`);
      for (const packageName of PRODUCT_BUNDLES) {
        npxDshOrExit(['plugin', '--profile', profile, 'add', `${packageName}@${DSH_VERSION}`], harnessEnv);
      }
    }

    installPreset({ refresh: refreshPreset });
    console.log('Codex and Claude Code providers are installed for Web and headless Harness profiles.');
    console.log('Their account/login state remains native to each product; this bootstrap does not create or expose credentials.');
    console.log('Web: start Harness, then choose “BharatShop System Agent” for the new session.');
    console.log('Headless: the launcher automatically applies the BharatShop product-subagent tool patch.');
    break;
  }

  case 'web': {
    assertSupportedNode();
    assertProductSetup({ profile: 'web', requirePreset: true });
    const portIndex = args.indexOf('--port');
    const port = portIndex >= 0 && args[portIndex + 1] ? args[portIndex + 1] : (process.env.DSH_PORT || '3080');
    console.log(`Starting DeepSeek Harness for BharatShop at http://127.0.0.1:${port}`);
    console.log('Create/select a session with the “BharatShop System Agent” preset to expose subagent_codex and subagent_claude_code.');
    npxDshOrExit(['--profile', 'web', '--host', '127.0.0.1', '--port', port, '--no-open']);
    break;
  }

  case 'task': {
    assertSupportedNode();
    assertProductSetup({ profile: 'headless' });
    const localRoute = ensureLocalOllamaSettings();
    if (!existsSync(HEADLESS_SUBAGENT_PATCH)) {
      console.error(`Missing headless subagent overlay: ${HEADLESS_SUBAGENT_PATCH}`);
      process.exit(2);
    }
    const task = args.join(' ').trim();
    if (!task) {
      console.error('Usage: node scripts/deepseek-harness.mjs task "your task"');
      process.exit(2);
    }
    const guardrails = readGuardrails();
    const prompt = `${guardrails}\n\nLOCAL-FIRST EXECUTION\nThe parent engineering model is local Ollama. Use repository tools directly to inspect, edit, test, and build. subagent_codex and subagent_claude_code are optional: delegate only when the provider is already authenticated and available; if either provider is unavailable, continue locally instead of failing the task. Keep final responsibility for verification and safety.\n\nCURRENT TASK\n${task}`.trim();
    console.log(`Running guarded Harness task on local Ollama model ${localRoute.model}; no DeepSeek API key is required.`);
    npxDshOrExit(['--profile', 'headless', '--patch', HEADLESS_SUBAGENT_PATCH, prompt], withLocalToolPath(safeHarnessEnv()));
    break;
  }

  default:
    console.error('Unknown mode. Use: status | install | subagents | web | task');
    process.exit(2);
}
