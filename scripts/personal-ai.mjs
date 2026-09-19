#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { selectSpecialists, arithmeticCheck, validateDraft, inspectFeature } from './agency-reliability.mjs';
import { inferenceFetch, readOllamaStream } from './machine-ai-transport.mjs';
let lastAgencyResult = null;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const AI_HOME = process.env.PERSONAL_AI_HOME || join(homedir(), '.bharatshop-ai');
const BROWSER_HOME = join(AI_HOME, 'browser-use');
const BROWSER_VENV = join(BROWSER_HOME, '.venv');
const BROWSER_RUNNER = join(ROOT, 'services', 'browser-use-local', 'runner.py');
const MEMORY_FILE = join(AI_HOME, 'memory.jsonl');
const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'qwen3.5:4b';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const BROWSER_USE_VERSION = '0.13.4';
const PIXVERSE_VERSION = '1.4.3';
const mode = (process.argv[2] || 'start').toLowerCase();
const argv = process.argv.slice(3);

mkdirSync(AI_HOME, { recursive: true });
mkdirSync(BROWSER_HOME, { recursive: true });

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: options.stdio || 'inherit',
    encoding: options.stdio === 'pipe' ? 'utf8' : undefined,
    windowsHide: false,
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

function pixverseEntry() {
  const root = globalNodeModules();
  if (!root) return null;
  const packagePath = join(root, 'pixverse', 'package.json');
  if (!existsSync(packagePath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const binField = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.pixverse || Object.values(pkg.bin || {})[0];
    if (!binField) return null;
    const entry = resolve(dirname(packagePath), binField);
    return existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

function runPixVerseCli(args = [], options = {}) {
  const entry = pixverseEntry();
  if (!entry) return { status: 1, stdout: '', stderr: 'PixVerse CLI is not installed.' };
  return run(process.execPath, [entry, ...args], options);
}

async function ollamaHealthy() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ollamaModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.models || []).map(item => item.name || item.model).filter(Boolean);
  } catch {
    return [];
  }
}

async function localChat(systemPrompt, messages, { json = false } = {}) {
  const response = await inferenceFetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      think: false,
      format: json ? 'json' : undefined,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      options: { num_ctx: Number(process.env.PERSONAL_AI_CONTEXT || 4096) },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Ollama request failed (HTTP ${response.status}).`); }
  return (await readOllamaStream(response, () => {})).trim();
}

function memorySafe(text) {
  return !/(password|passcode|private key|secret|api[_ -]?key|access[_ -]?token|bearer\s+[a-z0-9._-]+)/i.test(text || '');
}

function remember(role, content, route = 'chat') {
  if (/^(0|false|off|no)$/i.test(String(process.env.PERSONAL_AI_MEMORY || 'true'))) return;
  if (!content || !memorySafe(content)) return;
  appendFileSync(MEMORY_FILE, `${JSON.stringify({ at: new Date().toISOString(), role, route, content })}\n`, 'utf8');
}

function recentMemory(limit = 8) {
  if (!existsSync(MEMORY_FILE)) return [];
  try {
    return readFileSync(MEMORY_FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-limit).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function fallbackRoute(task) {
  const text = task.toLowerCase();
  if (/pixverse|generate (a )?(video|image)|text[- ]to[- ]video|image[- ]to[- ]video/.test(text)) return 'pixverse';
  if (/browse|browser|website|web page|log ?in|fill (a )?form|click|scrape|search the web/.test(text)) return 'browser';
  if (/build (an?|the)? ?(app|site|website|api|feature)|fix (the )?(code|repo|build)|implement|refactor|debug|codebase|repository/.test(text)) return 'build';
  if (/bharatshop.*(agent|company|autopilot)|run (the )?(company|agents)|company cycle/.test(text)) return 'company';
  if (/strategy|campaign|marketing|sales|design|product research|business plan|team of agents|specialists/.test(text)) return 'agency';
  return 'chat';
}

async function routeTask(task) {
  if (!(await ollamaHealthy())) return fallbackRoute(task);
  const prompt = `Choose exactly one route for the user's task. Return JSON only with keys route and reason.\n\nRoutes:\nchat = normal questions, explanations, writing, planning, brainstorming\nagency = use multiple specialist Agency Agents for strategy, design, marketing, sales, product or multidisciplinary work\nbuild = modify/build/debug software or repository files with the local coding harness\nbrowser = interact with websites using a local browser\npixverse = PixVerse image/video generation or creative-provider operations\ncompany = run the existing BharatShop company/autopilot agent cycle\n\nTask: ${task}`;
  try {
    const raw = await localChat('You are a conservative local task router. Choose tools only when the task actually needs them.', [{ role: 'user', content: prompt }], { json: true });
    const parsed = JSON.parse(raw);
    const route = String(parsed.route || '').toLowerCase();
    return new Set(['chat', 'agency', 'build', 'browser', 'pixverse', 'company']).has(route) ? route : fallbackRoute(task);
  } catch {
    return fallbackRoute(task);
  }
}

function saveAgencyResult(task, result) {
  const id = randomUUID();
  const reportDir = join(AI_HOME, 'agency-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportFile = join(reportDir, id + '.json');
  const report = { id, at: new Date().toISOString(), task: memorySafe(task) ? task : '[sensitive task omitted]', ...result };
  writeFileSync(reportFile, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
  lastAgencyResult = report;
  console.log('EXECUTION: ' + result.execution);
  console.log('VALIDATION: ' + result.validation.status + ' (' + result.validation.scope + ')');
  console.log('REPORT: ' + reportFile);
  return result.text;
}

async function agencyAnswer(task) {
  const qa = task.trim().match(/^\/qa-source\s+(cart|checkout|products|auth)$/i);
  if (qa) return saveAgencyResult(task, inspectFeature(ROOT, qa[1].toLowerCase()));
  const arithmetic = arithmeticCheck(task);
  if (arithmetic) return saveAgencyResult(task, arithmetic);
  const { discoverAgents } = await import('./local-agency.mjs');
  const selected = selectSpecialists(discoverAgents(), task);
  if (!selected.length) return saveAgencyResult(task, {
    execution:'BLOCKED', validation:{ status:'FAIL', scope:'routing', reason:'No relevant specialist matched; no arbitrary fallback team was used.' },
    selectedAgents:[], text:'No suitable specialist was found. Specify the feature or domain to review.'
  });
  console.log('Agency team: ' + selected.map(agent => agent.name).join(' + '));
  const reports = [];
  for (const agent of selected) {
    const answer = await localChat(`${agent.content}\nYou are a local specialist providing a draft. Do not claim tool execution or current repository/runtime facts without supplied evidence. Be concise; omit internal deliberation. Never request secrets.`, [{ role:'user', content:task }]);
    reports.push({ name:agent.name, slug:agent.slug, answer });
  }
  const synthesis = await localChat(
    'Combine these draft reports concisely. Check calculations. Remove abandoned calculations and self-corrections. Do not claim verification, tests, external actions, or specialist agreement prove correctness. Return only the final draft.',
    [{role:'user',content:'TASK:\n'+task+'\nREPORTS:\n'+reports.map(r=>r.name+': '+r.answer).join('\n')}]
  );
  return saveAgencyResult(task, { execution:'COMPLETED', validation:validateDraft(synthesis),
    method:'local specialist inference and synthesis', selectedAgents:selected.map(a=>({slug:a.slug,name:a.name})), reports, text:synthesis });
}

function python312() {
  if (process.platform === 'win32') {
    const py = executablePath('py.exe');
    if (py) {
      const result = capture(py, ['-3.12', '-c', 'import sys; print(sys.executable)']);
      if (result.status === 0 && result.stdout.trim()) return { command: result.stdout.trim(), prefix: [] };
    }
  }
  for (const name of process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3.12', 'python3', 'python']) {
    const path = executablePath(name);
    if (!path) continue;
    const result = capture(path, ['-c', 'import sys; print(sys.version_info[:2] >= (3, 11))']);
    if (result.status === 0 && /True/.test(result.stdout)) return { command: path, prefix: [] };
  }
  if (process.platform === 'win32') {
    const candidate = join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe');
    if (existsSync(candidate)) return { command: candidate, prefix: [] };
  }
  return null;
}

function venvPython() {
  const path = process.platform === 'win32' ? join(BROWSER_VENV, 'Scripts', 'python.exe') : join(BROWSER_VENV, 'bin', 'python');
  return existsSync(path) ? path : null;
}

function installPythonIfNeeded() {
  let python = python312();
  if (python) return python.command;
  if (process.platform !== 'win32') throw new Error('Python 3.11+ is required for Browser Use. Install Python 3.12 and rerun setup.');
  const winget = executablePath('winget.exe');
  if (!winget) throw new Error('Python 3.12 is missing and winget is unavailable. Install Python 3.12 and rerun setup.');
  console.log('\nInstalling Python 3.12 for local browser automation...');
  const result = run(winget, ['install', '--id', 'Python.Python.3.12', '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements']);
  if (result.status !== 0) throw new Error('Python 3.12 installation failed.');
  python = python312();
  if (!python) throw new Error('Python installed but cannot be found yet. Reopen PowerShell and rerun npm.cmd run ai:setup.');
  return python.command;
}

function setupBrowserUse() {
  const python = installPythonIfNeeded();
  let vpy = venvPython();
  if (!vpy) {
    console.log('\nCreating isolated Browser Use environment...');
    const result = run(python, ['-m', 'venv', BROWSER_VENV]);
    if (result.status !== 0) throw new Error('Could not create Browser Use virtual environment.');
    vpy = venvPython();
  }
  console.log(`Installing Browser Use ${BROWSER_USE_VERSION}...`);
  if (run(vpy, ['-m', 'pip', 'install', '--upgrade', 'pip']).status !== 0) throw new Error('pip upgrade failed.');
  if (run(vpy, ['-m', 'pip', 'install', `browser-use==${BROWSER_USE_VERSION}`]).status !== 0) throw new Error('Browser Use installation failed.');
  console.log('Installing local Chromium for Browser Use...');
  if (run(vpy, ['-m', 'playwright', 'install', 'chromium']).status !== 0) throw new Error('Chromium installation failed.');
}

function setupPixVerseConnector() {
  if (pixverseEntry()) return;
  const npmCli = npmCliPath();
  if (!npmCli) {
    console.log('PixVerse connector: npm CLI could not be resolved; skipping install.');
    return;
  }
  console.log(`\nInstalling PixVerse CLI ${PIXVERSE_VERSION} connector (generation itself may require PixVerse subscription/credits)...`);
  const result = run(process.execPath, [npmCli, 'install', '--global', `pixverse@${PIXVERSE_VERSION}`]);
  if (result.status !== 0) console.log('PixVerse CLI install did not complete; the free local AI system will still work without it.');
}

function setupHarnessLocal() {
  const ollama = ollamaPath();
  if (!ollama) {
    console.log('DeepSeek Harness local bridge skipped because Ollama was not found.');
    return;
  }
  console.log('\nConfiguring official Ollama â†’ DeepSeek Harness local bridge...');
  const result = run(ollama, ['launch', 'dsh', '--config']);
  if (result.status !== 0) {
    console.log('Ollama could not configure DeepSeek Harness automatically. Update Ollama, then rerun ai:setup.');
  }
}

async function setupAll() {
  console.log('=== BharatShop Personal AI â€” free/local setup ===');
  console.log(`Local model: ${MODEL}`);
  const agency = run(process.execPath, [join(ROOT, 'scripts', 'local-agency.mjs'), 'setup']);
  if (agency.status !== 0) throw new Error('Local Agency/Ollama setup failed.');
  setupBrowserUse();
  setupHarnessLocal();
  setupPixVerseConnector();
  if (!existsSync(MEMORY_FILE)) appendFileSync(MEMORY_FILE, '', 'utf8');
  console.log('\nCore local setup complete. Checking capability matrix...\n');
  await printStatus();
}

async function browserReady() {
  const python = venvPython();
  if (!python || !existsSync(BROWSER_RUNNER)) return false;
  const result = capture(python, ['-c', 'import browser_use; print("ok")']);
  return result.status === 0 && /ok/.test(result.stdout);
}

async function agencyCount() {
  try {
    const { discoverAgents } = await import('./local-agency.mjs');
    return discoverAgents().length;
  } catch {
    return 0;
  }
}

function harnessConfigured() {
  return existsSync(join(homedir(), '.ollama', 'launch', 'dsh', 'settings.yaml'));
}

function companyWired() {
  return existsSync(join(ROOT, 'scripts', 'run-company-autopilot.ps1'));
}

function pixverseAuthReady() {
  if (!pixverseEntry()) return false;
  const result = runPixVerseCli(['auth', 'status', '--json'], { stdio: 'pipe', quiet: true });
  return result.status === 0;
}

async function statusRows() {
  const healthy = await ollamaHealthy();
  const models = healthy ? await ollamaModels() : [];
  const agents = await agencyCount();
  return [
    { name: 'Local AI / Ollama', ready: healthy, note: healthy ? `${MODEL} local endpoint responding` : 'not responding' },
    { name: 'Local model', ready: models.includes(MODEL), note: models.includes(MODEL) ? MODEL : `missing ${MODEL}` },
    { name: 'Agency workforce', ready: agents > 0, note: agents ? `${agents} agents discovered` : 'catalog not installed' },
    { name: 'Local memory', ready: existsSync(MEMORY_FILE), note: MEMORY_FILE },
    { name: 'App builder / DeepSeek Harness', ready: Boolean(ollamaPath()) && harnessConfigured(), note: 'Ollama launch dsh; no Claude/Codex required' },
    { name: 'Browser automation', ready: await browserReady(), note: `Browser Use ${BROWSER_USE_VERSION} + local Chromium` },
    { name: 'BharatShop company agents', ready: companyWired(), note: 'wired; production-impacting runs remain approval-gated' },
    { name: 'PixVerse CLI connector', ready: Boolean(pixverseEntry()), note: `CLI ${PIXVERSE_VERSION}; external provider` },
    { name: 'PixVerse account/generation', ready: pixverseAuthReady(), note: 'requires PixVerse authentication and may consume paid credits' },
  ];
}

async function printStatus() {
  console.log('=== Personal AI capability matrix ===');
  for (const row of await statusRows()) {
    console.log(`${row.ready ? 'ðŸŸ¢' : 'ðŸŸ¡'} ${row.name.padEnd(32)} ${row.note}`);
  }
  console.log('\nGreen means the local connector/runtime is actually detected. PixVerse generation is intentionally not called â€œfreeâ€ because its provider requires subscription/credits.');
}

async function runBuild(task) {
  const ollama = ollamaPath();
  if (!ollama) throw new Error('Ollama is not installed. Run npm.cmd run ai:setup.');
  if (!harnessConfigured()) throw new Error('DeepSeek Harness local bridge is not configured. Run npm.cmd run ai:setup.');
  const guardrailsPath = join(ROOT, 'agents', 'DEEPSEEK_SYSTEM_AGENT.md');
  const guardrails = existsSync(guardrailsPath) ? readFileSync(guardrailsPath, 'utf8') : '';
  const prompt = `${guardrails}\n\nLOCAL-ONLY MODE\nUse the local Ollama model only. Do not invoke Claude Code, Codex, paid APIs, cloud web search, billing, publishing, production database mutation, or credential inspection. Work only inside the current repository. Verify edits with relevant tests/build checks.\n\nTASK\n${task}`.trim();
  const result = run(ollama, ['launch', 'dsh', '--model', MODEL, '--', '--profile', 'headless', prompt]);
  if (result.status !== 0) throw new Error(`Local DeepSeek Harness task failed with exit code ${result.status}.`);
  return 'Local coding task completed. Review the Harness output and git diff before committing or deploying.';
}

async function runBrowser(task) {
  const python = venvPython();
  if (!python || !(await browserReady())) throw new Error('Browser Use is not ready. Run npm.cmd run ai:setup.');
  const args = [BROWSER_RUNNER, task, '--model', MODEL];
  if (/^(1|true|yes|on)$/i.test(String(process.env.PERSONAL_AI_BROWSER_HEADLESS || ''))) args.push('--headless');
  const result = run(python, args);
  if (result.status !== 0) throw new Error(`Browser worker stopped with exit code ${result.status}.`);
  return 'Browser task finished. Any irreversible action was intentionally left for your approval.';
}

async function runCompany() {
  const script = join(ROOT, 'scripts', 'run-company-autopilot.ps1');
  if (!existsSync(script)) throw new Error('BharatShop company autopilot script is missing.');
  const powershell = executablePath('powershell.exe') || executablePath('pwsh.exe');
  if (!powershell) throw new Error('PowerShell is required for the existing BharatShop company agent runtime.');
  const result = run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'Once']);
  if (result.status !== 0) throw new Error(`BharatShop company cycle failed with exit code ${result.status}.`);
  return 'One BharatShop company-agent cycle completed through the existing guarded runtime.';
}

async function runPixVerse(task, execute) {
  if (!pixverseEntry()) throw new Error('PixVerse CLI connector is not installed. Run npm.cmd run ai:setup.');
  const type = /\bvideo\b/i.test(task) ? 'video' : 'image';
  const args = [join(ROOT, 'scripts', 'pixverse-creative.mjs'), 'create', '--type', type, '--prompt', task];
  if (execute) args.push('--execute');
  const result = run(process.execPath, args);
  if (result.status !== 0) throw new Error(`PixVerse ${execute ? 'generation' : 'plan'} failed with exit code ${result.status}.`);
  return execute ? 'PixVerse request submitted through its guarded credit gate.' : 'PixVerse plan created; no credits were spent.';
}

async function generalAnswer(task) {
  const mem = recentMemory().map(item => `${item.role}: ${item.content}`).join('\n');
  const system = `You are the user's private local Personal AI running through Ollama on their own machine. Be practical and concise. You may explain and plan, but never claim that tools or external actions ran unless this orchestrator actually ran them. Never request secrets.\n${mem ? `Recent local memory:\n${mem}` : ''}`;
  return localChat(system, [{ role: 'user', content: task }]);
}

async function confirmExecution(rl, route) {
  const descriptions = {
    build: 'modify files/run local development commands in this repository',
    browser: 'open/control a local browser and interact with websites',
    company: 'run one existing BharatShop company-agent cycle',
    pixverse: 'call the external PixVerse connector (credit gate still applies)',
  };
  const answer = (await rl.question(`Approve ${descriptions[route]}? [y/N] `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

async function dispatch(route, task, { execute = false, interactiveRl = null } = {}) {
  if (route === 'chat') return generalAnswer(task);
  if (route === 'agency') return agencyAnswer(task);

  let approved = execute;
  if (!approved && interactiveRl) approved = await confirmExecution(interactiveRl, route);
  if (!approved) return `Planned route: ${route}. No external/file-changing action was run. Re-run with --execute or approve it in interactive chat.`;

  if (route === 'build') return runBuild(task);
  if (route === 'browser') return runBrowser(task);
  if (route === 'company') return runCompany();
  if (route === 'pixverse') return runPixVerse(task, true);
  throw new Error(`Unsupported route: ${route}`);
}

function parseTaskArgs(args) {
  const mutable = [...args];
  let execute = false;
  let route = null;
  for (let i = 0; i < mutable.length;) {
    if (mutable[i] === '--execute') {
      execute = true;
      mutable.splice(i, 1);
      continue;
    }
    if (mutable[i] === '--route') {
      route = String(mutable[i + 1] || '').toLowerCase();
      mutable.splice(i, 2);
      continue;
    }
    i += 1;
  }
  return { task: mutable.join(' ').trim(), route, execute };
}

function printHelp() {
  console.log(`\nCommands:\n  /status                         capability matrix\n  /chat <task>                    local Q&A\n  /agency <task>                  specialist team\n  /build <task>                   local DeepSeek Harness app/code worker\n  /browser <task>                 Browser Use + local Ollama\n  /pixverse <task>                guarded PixVerse connector\n  /company                        one guarded BharatShop company cycle\n  /help                           this help\n  /exit                           quit\n\nNatural language is automatically routed. Actions that can change files, websites, company state, or credits ask for approval.\n`);
}

async function interactive() {
  if (!(await ollamaHealthy())) throw new Error('Local Ollama is not responding. Run npm.cmd run ai:setup first.');
  console.log(`\nBharatShop Personal AI â€” ${MODEL}`);
  console.log('Private/local brain + Agency Agents + app builder + browser worker. Type /help for commands.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const input = (await rl.question('\nYou> ')).trim();
      if (!input) continue;
      if (input === '/exit' || input === '/quit') break;
      if (input === '/help') { printHelp(); continue; }
      if (input === '/status') { await printStatus(); continue; }

      let route;
      let task = input;
      const explicit = input.match(/^\/(chat|agency|build|browser|pixverse|company)\b\s*(.*)$/i);
      if (explicit) {
        route = explicit[1].toLowerCase();
        task = explicit[2].trim() || (route === 'company' ? 'Run one BharatShop company cycle' : '');
      } else {
        route = await routeTask(input);
      }
      if (!task) { console.log('Please include a task.'); continue; }
      console.log(`Route: ${route}`);
      remember('user', task, route);
      try {
        const answer = await dispatch(route, task, { interactiveRl: rl });
        console.log(`\nAI> ${answer}`);
        remember('assistant', answer, route);
      } catch (error) {
        console.error(`\nTool error: ${error.message}`);
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  if (mode === 'setup') return setupAll();
  if (mode === 'status') return printStatus();
  if (mode === 'start' || mode === 'chat') return interactive();
  if (mode === 'task') {
    const { task, route: requestedRoute, execute } = parseTaskArgs(argv);
    if (!task) throw new Error('Usage: npm.cmd run ai:task -- "your task" [--route chat|agency|build|browser|pixverse|company] [--execute]');
    const route = requestedRoute || await routeTask(task);
    console.log(`Route: ${route}`);
    const answer = await dispatch(route, task, { execute });
    console.log(answer);
    if (route === 'agency' && lastAgencyResult?.validation?.status !== 'PASS') process.exitCode = 2;
    return;
  }
  console.error('Modes: setup | status | start | task');
  process.exit(2);
}

main().catch(error => {
  console.error(`Personal AI error: ${error.message}`);
  process.exit(1);
});
