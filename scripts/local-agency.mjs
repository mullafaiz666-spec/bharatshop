#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import process from 'node:process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const AGENCY_HOME = process.env.AGENCY_HOME || join(homedir(), '.bharatshop-agency');
const CATALOG_DIR = join(AGENCY_HOME, 'agency-agents');
const UPSTREAM_REPO = 'https://github.com/msitarzewski/agency-agents.git';
const DEFAULT_MODEL = process.env.AGENCY_MODEL || 'qwen3.5:4b';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const mode = (process.argv[2] || 'start').toLowerCase();
const args = process.argv.slice(3);

const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

function commandResult(command, commandArgs = [], options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: options.env || process.env,
  });
}

function run(command, commandArgs = [], options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    stdio: options.stdio || 'inherit',
    encoding: options.stdio === 'pipe' ? 'utf8' : undefined,
    windowsHide: false,
    env: options.env || process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    return result.status ?? 1;
  }
  return result.status ?? 1;
}

function findCommand(name, candidates = []) {
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, name] : [name];
  for (const candidate of [...names, ...candidates]) {
    const result = commandResult(candidate, ['--version']);
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

function gitCommand() {
  const candidates = process.platform === 'win32'
    ? [join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')]
    : [];
  return findCommand('git', candidates);
}

function ollamaCommand() {
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
      ]
    : [];
  return findCommand('ollama', candidates.filter(Boolean));
}

function wingetCommand() {
  return process.platform === 'win32' ? findCommand('winget') : null;
}

function ensureGit() {
  const git = gitCommand();
  if (git) return git;
  console.error('Git is required. On Windows install it with: winget install --id Git.Git -e');
  process.exit(2);
}

function ensureCatalog({ sync = true } = {}) {
  mkdirSync(AGENCY_HOME, { recursive: true });
  const git = ensureGit();
  if (!existsSync(join(CATALOG_DIR, '.git'))) {
    console.log('Cloning the Agency Agents catalog...');
    const status = run(git, ['clone', '--depth', '1', UPSTREAM_REPO, CATALOG_DIR], { cwd: AGENCY_HOME });
    if (status !== 0) process.exit(status);
  } else if (sync) {
    console.log('Updating the Agency Agents catalog...');
    const status = run(git, ['-C', CATALOG_DIR, 'pull', '--ff-only', 'origin', 'main']);
    if (status !== 0) process.exit(status);
  }
  return CATALOG_DIR;
}

function installOllamaIfNeeded() {
  let ollama = ollamaCommand();
  if (ollama) return ollama;

  if (process.platform !== 'win32') {
    console.error('Ollama was not found. Install it from https://ollama.com/download and rerun setup.');
    process.exit(2);
  }

  const winget = wingetCommand();
  if (!winget) {
    console.error('Ollama and winget were not found. Install Ollama for Windows, then rerun setup.');
    process.exit(2);
  }

  console.log('Installing Ollama locally with winget...');
  const status = run(winget, [
    'install', '--id', 'Ollama.Ollama', '-e', '--source', 'winget',
    '--accept-package-agreements', '--accept-source-agreements',
  ]);
  if (status !== 0) process.exit(status);

  ollama = ollamaCommand();
  if (!ollama) {
    console.error('Ollama installed, but this PowerShell session cannot locate it yet. Close and reopen PowerShell, then rerun npm.cmd run agency:setup.');
    process.exit(2);
  }
  return ollama;
}

async function ollamaHealthy() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureOllamaServer(ollama) {
  if (await ollamaHealthy()) return;
  console.log('Starting the local Ollama service...');
  try {
    const child = spawn(ollama, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    });
    child.unref();
  } catch (error) {
    console.error(`Could not start Ollama: ${error.message}`);
  }

  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(1000);
    if (await ollamaHealthy()) return;
  }

  console.error(`Ollama is installed but not responding at ${OLLAMA_BASE_URL}. Start Ollama and rerun this command.`);
  process.exit(2);
}

function loadDivisions() {
  const path = join(CATALOG_DIR, 'divisions.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.divisions || {};
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---')) return {};
  const end = markdown.indexOf('\n---', 3);
  if (end < 0) return {};
  const frontmatter = markdown.slice(3, end).trim();
  const result = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return result;
}

export function discoverAgents(catalogDir = CATALOG_DIR) {
  const divisionsPath = join(catalogDir, 'divisions.json');
  if (!existsSync(divisionsPath)) return [];
  const parsed = JSON.parse(readFileSync(divisionsPath, 'utf8'));
  const divisions = parsed.divisions || {};
  const agents = [];

  for (const division of Object.keys(divisions)) {
    const dir = join(catalogDir, division);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const path = join(dir, file);
      const content = readFileSync(path, 'utf8');
      const meta = parseFrontmatter(content);
      const slug = basename(file, '.md');
      const shortSlug = slug.startsWith(`${division}-`) ? slug.slice(division.length + 1) : slug;
      agents.push({
        slug,
        shortSlug,
        name: meta.name || shortSlug.replace(/-/g, ' '),
        description: meta.description || '',
        division,
        path,
        content,
      });
    }
  }

  return agents.sort((a, b) => a.slug.localeCompare(b.slug));
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function resolveAgent(spec, agents) {
  const wanted = normalize(spec);
  const exact = agents.find(agent =>
    normalize(agent.slug) === wanted ||
    normalize(agent.shortSlug) === wanted ||
    normalize(agent.name) === wanted,
  );
  if (exact) return exact;

  const matches = agents.filter(agent => {
    const haystack = normalize(`${agent.slug} ${agent.shortSlug} ${agent.name} ${agent.description}`);
    return haystack.includes(wanted);
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const preview = matches.slice(0, 12).map(agent => `  ${agent.slug} — ${agent.name}`).join('\n');
    throw new Error(`Agent name is ambiguous. Matches:\n${preview}`);
  }
  throw new Error(`No agency agent matched "${spec}". Run npm.cmd run agency:search -- "${spec}".`);
}

async function localChat(systemPrompt, messages, model = DEFAULT_MODEL) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      options: {
        num_ctx: Number(process.env.AGENCY_CONTEXT || 32768),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${body}`);
  }
  const payload = await response.json();
  return payload?.message?.content?.trim() || '';
}

function systemPromptFor(agent) {
  return `${agent.content}\n\n---\nLOCAL BHARATSHOP AGENCY RUNTIME\nYou are running locally through Ollama. Do not claim to have accessed files, websites, credentials, databases, payment systems, production systems, or external services unless the user explicitly provides that information in the conversation. Never request or expose secrets. Treat production database changes, publishing, billing, customer-impacting actions, destructive commands, and credential handling as approval-gated. Give concrete deliverables and clearly distinguish advice from actions actually performed.`;
}

async function prepareLocalRuntime({ sync = false, pullModel = false } = {}) {
  ensureCatalog({ sync });
  const ollama = installOllamaIfNeeded();
  await ensureOllamaServer(ollama);
  if (pullModel) {
    console.log(`Ensuring local model is available: ${DEFAULT_MODEL}`);
    const status = run(ollama, ['pull', DEFAULT_MODEL]);
    if (status !== 0) process.exit(status);
  }
  return { ollama, agents: discoverAgents() };
}

function printSummary(agents) {
  const divisions = loadDivisions();
  console.log('=== BharatShop Free Local Agency ===');
  console.log(`Catalog: ${CATALOG_DIR}`);
  console.log(`Agents discovered: ${agents.length}`);
  console.log(`Divisions: ${Object.keys(divisions).length}`);
  console.log(`Local model: ${DEFAULT_MODEL}`);
  console.log(`Ollama: ${OLLAMA_BASE_URL}`);
  console.log('Paid API keys required: NO');
}

function printAgents(agents, filter = '') {
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? agents.filter(agent => `${agent.slug} ${agent.name} ${agent.description} ${agent.division}`.toLowerCase().includes(q))
    : agents;
  for (const agent of filtered) {
    console.log(`${agent.slug.padEnd(48)} ${agent.name} [${agent.division}]`);
  }
  console.log(`\n${filtered.length} agent(s) shown.`);
}

async function runSingleAgent(agent, task) {
  const answer = await localChat(systemPromptFor(agent), [{ role: 'user', content: task }]);
  console.log(`\n[${agent.name}]\n${answer}\n`);
  return answer;
}

async function chatWithAgent(agent) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history = [];
  console.log(`\nLocal chat: ${agent.name} (${agent.slug})`);
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log('Type /exit to stop. No paid API is used.\n');
  try {
    while (true) {
      const input = (await rl.question('You> ')).trim();
      if (!input) continue;
      if (input === '/exit' || input === '/quit') break;
      history.push({ role: 'user', content: input });
      const answer = await localChat(systemPromptFor(agent), history);
      console.log(`\n${agent.name}> ${answer}\n`);
      history.push({ role: 'assistant', content: answer });
    }
  } finally {
    rl.close();
  }
}

async function interactiveStart() {
  const { agents } = await prepareLocalRuntime({ sync: false, pullModel: false });
  printSummary(agents);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const query = (await rl.question('\nSearch an agent (example: frontend, sales, security) or /exit: ')).trim();
      if (query === '/exit' || query === '/quit') return;
      const matches = agents.filter(agent => `${agent.slug} ${agent.name} ${agent.description}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20);
      if (matches.length === 0) {
        console.log('No matches. Try another term.');
        continue;
      }
      matches.forEach((agent, index) => console.log(`${index + 1}) ${agent.name} — ${agent.slug}`));
      const selection = Number(await rl.question('Choose number: '));
      const chosen = matches[selection - 1];
      if (!chosen) {
        console.log('Invalid selection.');
        continue;
      }
      rl.close();
      await chatWithAgent(chosen);
      return;
    }
  } finally {
    rl.close();
  }
}

async function main() {
  switch (mode) {
    case 'setup': {
      const { agents } = await prepareLocalRuntime({ sync: true, pullModel: true });
      printSummary(agents);
      console.log('\nSetup complete. Start with: npm.cmd run agency:start');
      break;
    }

    case 'sync': {
      ensureCatalog({ sync: true });
      const agents = discoverAgents();
      console.log(`Agency catalog updated. ${agents.length} agents discovered.`);
      break;
    }

    case 'status': {
      ensureCatalog({ sync: false });
      const agents = discoverAgents();
      printSummary(agents);
      console.log(`Ollama installed: ${ollamaCommand() ? 'YES' : 'NO'}`);
      console.log(`Ollama responding: ${(await ollamaHealthy()) ? 'YES' : 'NO'}`);
      break;
    }

    case 'list': {
      ensureCatalog({ sync: false });
      printAgents(discoverAgents(), args.join(' '));
      break;
    }

    case 'search': {
      ensureCatalog({ sync: false });
      const query = args.join(' ').trim();
      if (!query) throw new Error('Usage: npm.cmd run agency:search -- "frontend"');
      printAgents(discoverAgents(), query);
      break;
    }

    case 'run': {
      const { agents } = await prepareLocalRuntime({ sync: false, pullModel: false });
      const agentSpec = args.shift();
      const task = args.join(' ').trim();
      if (!agentSpec || !task) throw new Error('Usage: npm.cmd run agency:run -- <agent> "task"');
      const agent = resolveAgent(agentSpec, agents);
      await runSingleAgent(agent, task);
      break;
    }

    case 'team': {
      const { agents } = await prepareLocalRuntime({ sync: false, pullModel: false });
      const teamSpec = args.shift();
      const task = args.join(' ').trim();
      if (!teamSpec || !task) throw new Error('Usage: npm.cmd run agency:team -- agent1,agent2 "task"');
      const team = teamSpec.split(',').map(name => resolveAgent(name.trim(), agents));
      const reports = [];
      for (const agent of team) {
        console.log(`\nRunning ${agent.name}...`);
        const answer = await localChat(systemPromptFor(agent), [{ role: 'user', content: task }]);
        reports.push({ agent, answer });
        console.log(`[${agent.name}] complete.`);
      }
      const synthesisPrompt = `You are the local Agency Manager. Synthesize specialist reports into one practical result. Preserve disagreements and uncertainty. Do not claim that external actions were performed.\n\nTASK:\n${task}\n\nREPORTS:\n${reports.map(item => `## ${item.agent.name}\n${item.answer}`).join('\n\n')}`;
      const finalAnswer = await localChat('You are a careful multi-agent synthesis lead running entirely on a local model.', [{ role: 'user', content: synthesisPrompt }]);
      console.log(`\n=== TEAM RESULT ===\n${finalAnswer}\n`);
      break;
    }

    case 'chat': {
      const { agents } = await prepareLocalRuntime({ sync: false, pullModel: false });
      const agentSpec = args.join(' ').trim();
      if (!agentSpec) return interactiveStart();
      await chatWithAgent(resolveAgent(agentSpec, agents));
      break;
    }

    case 'start':
      await interactiveStart();
      break;

    default:
      console.error('Modes: setup | start | status | sync | list | search | run | chat | team');
      process.exit(2);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(`Agency runtime error: ${error.message}`);
    process.exit(1);
  });
}
