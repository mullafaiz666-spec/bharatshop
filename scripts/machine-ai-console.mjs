#!/usr/bin/env node

import readline from 'node:readline/promises';
import process from 'node:process';
import { discoverAgents } from './local-agency.mjs';
import { hydrateMcpAuth } from './mcp-auth-bridge.mjs';
import { createMcpRouter } from './mcp-router.mjs';
import { runMcpChat } from './machine-ai-mcp-chat.mjs';

const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || process.env.AI_TEXT_MODEL || 'qwen3.5:4b';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CONTEXT = Number(process.env.PERSONAL_AI_CONTEXT || '4096');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function transientOllamaError(error) {
  return /(ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|UND_ERR_SOCKET)/i.test(String(error?.message || error));
}

async function fetchJsonOnce(url, options = {}, timeoutMs = 120000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return data;
}

async function fetchJson(url, options = {}, timeoutMs = 120000) {
  try {
    return await fetchJsonOnce(url, options, timeoutMs);
  } catch (error) {
    if (!transientOllamaError(error)) throw error;
    await delay(500);
    return fetchJsonOnce(url, options, timeoutMs);
  }
}

async function models() {
  const data = await fetchJson(`${OLLAMA_BASE_URL}/api/tags`, {}, 8000);
  return Array.isArray(data?.models) ? data.models.map(item => item?.name || item?.model).filter(Boolean) : [];
}

async function localChat(systemPrompt, messages) {
  const payload = await fetchJson(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      options: { num_ctx: CONTEXT },
    }),
  }, 180000);
  return String(payload?.message?.content || '').trim();
}

function agentScore(agent, task) {
  const tokens = [...new Set(String(task).toLowerCase().match(/[a-z0-9]{4,}/g) || [])];
  const haystack = `${agent.slug} ${agent.shortSlug} ${agent.name} ${agent.description} ${agent.division}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

async function runAgency(task) {
  const agents = discoverAgents();
  if (!agents.length) throw new Error('Agency catalog is not installed. Run npm.cmd run agency:setup first.');
  const selected = [...agents]
    .map(agent => ({ agent, score: agentScore(agent, task) }))
    .sort((a, b) => b.score - a.score || a.agent.slug.localeCompare(b.agent.slug))
    .filter(item => item.score > 0)
    .slice(0, 3)
    .map(item => item.agent);
  if (!selected.length) selected.push(...agents.slice(0, 3));

  console.log(`Agency team: ${selected.map(agent => agent.name).join(' + ')}`);
  const reports = [];
  for (const agent of selected) {
    const answer = await localChat(
      `${agent.content}\n\nLOCAL MACHINE MODE\nYou are a BharatShop specialist running only through local Ollama model ${MODEL}. Do not claim external actions were performed. Do not request secrets. Production changes, browser actions, publishing, payments and destructive actions are approval-gated.`,
      [{ role: 'user', content: task }],
    );
    reports.push({ name: agent.name, answer });
  }
  return localChat(
    `You are the BharatShop local Agency Manager running through Ollama model ${MODEL}. Synthesize the specialist reports into one concise practical answer. Do not invent completed external actions.`,
    [{ role: 'user', content: `TASK:\n${task}\n\nREPORTS:\n${reports.map(item => `## ${item.name}\n${item.answer}`).join('\n\n')}` }],
  );
}

async function mcpRouter() {
  await hydrateMcpAuth();
  return createMcpRouter();
}

async function printMcpStatus(connector = 'all') {
  const router = await mcpRouter();
  const status = await router.status({ probe: true });
  const selected = connector === 'all' ? status : status.filter(item => item.name === connector);
  console.log(`\n${JSON.stringify(selected, null, 2)}`);
}

async function printMcpTools(connector = 'all') {
  const router = await mcpRouter();
  const tools = await router.tools(connector, { probe: true, skipUnavailable: connector === 'all' });
  console.log(`\n${JSON.stringify(tools.map(({ connector: c, name, description }) => ({ connector: c, name, description })), null, 2)}`);
}

async function printAudit() {
  let installed = [];
  let ollamaState = 'NOT RESPONDING';
  try {
    installed = await models();
    if (installed.length) ollamaState = 'RESPONDING';
  } catch {}
  const agents = discoverAgents();
  const router = await mcpRouter();
  const mcp = await router.status({ probe: true });
  let queue = { pending: 0, running: 0, results: 0 };
  try {
    queue = await router.callTool('local', 'queue_status', {});
  } catch {}
  const allMcpVerified = mcp.length > 0 && mcp.every(item => item.state === 'VERIFIED');

  console.log(`\nLOCAL READ-ONLY AUDIT — ${new Date().toISOString()}`);
  console.log(`Ollama model-list endpoint: ${ollamaState}`);
  console.log(`Configured model: ${MODEL}; installed: ${installed.includes(MODEL)}`);
  console.log(`Registered agent definitions: ${agents.length} (definition count, not running-process count).`);
  console.log(`Queue files: pending=${queue.pending || 0}, running=${queue.running || 0}, results=${queue.results || 0}.`);
  console.log('\nMCP CONNECTORS');
  for (const item of mcp) {
    const extras = [
      Number.isFinite(item.tools) ? `tools=${item.tools}` : '',
      item.readOnly ? 'read-only' : '',
      Array.isArray(item.missing) && item.missing.length ? `missing=${item.missing.join(',')}` : '',
      item.error ? `error=${item.error}` : '',
    ].filter(Boolean).join('; ');
    console.log(`${String(item.name || '').toUpperCase()}: ${item.state}${extras ? ` (${extras})` : ''}`);
  }
  console.log(`\nMCP SYSTEM = ${allMcpVerified ? 'VERIFIED' : 'NEEDS WORK'}`);
  console.log('No production writes, deploys, merges, payments, or destructive database actions were performed.');
}

async function printStatus() {
  const installed = await models();
  const agents = discoverAgents();
  console.log('\n=== BharatShop Laptop Machine AI ===');
  console.log(`OLLAMA: READY (${OLLAMA_BASE_URL})`);
  console.log(`ACTIVE MODEL: ${MODEL}`);
  console.log(`MODEL INSTALLED: ${installed.includes(MODEL) ? 'YES' : 'NO'}`);
  console.log(`INSTALLED MODELS: ${installed.join(', ') || 'none'}`);
  console.log(`AGENCY AGENTS: ${agents.length}`);
  console.log('MCP: explicit /mcp commands only');
  console.log('CLOUD TOKEN BILLING: NO for this local Ollama console');
}

async function printAbout() {
  const installed = await models();
  const agents = discoverAgents();
  const cloudListed = installed.filter(name => /:cloud$/i.test(name));
  console.log('\n=== BharatShop Laptop AI - Authoritative Runtime Info ===');
  console.log(`ACTIVE MODEL: ${MODEL}`);
  console.log(`INFERENCE: LOCAL via ${OLLAMA_BASE_URL}`);
  console.log(`INSTALLED MODELS: ${installed.join(', ') || 'none'}`);
  console.log(`LOCAL SPECIALIST AGENTS: ${agents.length}`);
  console.log('THIS CONSOLE: direct local chat + explicit /agency specialist teamwork + explicit /mcp read-only tool mode');
  console.log('BROADER LAPTOP STACK: 24x7 local task queue, local memory, Browser Use and coding/company tools through separate approval-gated commands');
  console.log('PRIVACY: direct Qwen inference stays on the loopback Ollama endpoint; explicitly invoked MCP/external connectors may send data to their provider');
  console.log('COST: no per-token cloud billing for the active local Qwen model');
  if (cloudListed.length) console.log(`CLOUD-LISTED BUT NOT ACTIVE: ${cloudListed.join(', ')}`);
}

function asksRuntimeIdentity(input) {
  const text = String(input || '').toLowerCase();
  return /(?:what|tell me|which).*model/.test(text) && /(?:local|cloud|ollama|laptop|can you do|capabilit)/.test(text);
}

function help() {
  console.log(`\nCommands:\n  /status                    show actual local runtime status\n  /audit                     deterministic read-only runtime + MCP audit\n  /about                     authoritative model/local/cloud/capability info\n  /models                    list actual Ollama models\n  /agency <task>             explicitly use up to 3 local specialist agents\n  /mcp                       probe MCP connector status\n  /mcp status               probe MCP connector status\n  /mcp tools [connector]     list real discovered MCP tools\n  /mcp test <connector>      probe github, supabase, or local connector\n  /mcp <task>                explicit read-only MCP-assisted Qwen task\n  /chat <task>               direct local chat\n  /help                      show commands\n  /exit                      exit\n\nBare text always stays in direct chat. It will never silently switch to agency/MCP/browser/company mode.`);
}

async function main() {
  const installed = await models();
  if (!installed.includes(MODEL)) throw new Error(`Required local model ${MODEL} is not installed.`);

  console.log(`\nBharatShop Laptop Machine AI - ${MODEL}`);
  console.log('Private local Ollama console. Bare text = chat; specialist and external tool modes require explicit commands.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history = [];
  try {
    while (true) {
      const input = (await rl.question('\nYou> ')).trim();
      if (!input) continue;
      if (input === '/exit' || input === '/quit') break;
      if (input === '/help') { help(); continue; }
      if (input === '/status') { await printStatus(); continue; }
      if (input === '/audit') { await printAudit(); continue; }
      if (input === '/about' || asksRuntimeIdentity(input)) { await printAbout(); continue; }
      if (input === '/models' || /^ollama\s+list$/i.test(input)) {
        console.log(`\nModels: ${(await models()).join(', ') || 'none'}`);
        continue;
      }

      if (/^\/mcp(?:\s+(?:status|connectors))?$/i.test(input)) {
        await printMcpStatus();
        continue;
      }
      const mcpTools = input.match(/^\/mcp\s+tools(?:\s+(github|supabase|local|all))?$/i);
      if (mcpTools) {
        await printMcpTools((mcpTools[1] || 'all').toLowerCase());
        continue;
      }
      const mcpTest = input.match(/^\/mcp\s+test\s+(github|supabase|local|all)$/i);
      if (mcpTest) {
        await printMcpStatus(mcpTest[1].toLowerCase());
        continue;
      }
      const mcpTask = input.match(/^\/mcp\s+(.+)$/i);
      if (mcpTask) {
        const answer = await runMcpChat(mcpTask[1].trim());
        console.log(`\nAI> ${answer}`);
        continue;
      }

      const agency = input.match(/^\/agency\s+(.+)$/i);
      if (agency) {
        const answer = await runAgency(agency[1].trim());
        console.log(`\nAI> ${answer}`);
        continue;
      }

      const explicitChat = input.match(/^\/chat\s+(.+)$/i);
      const task = explicitChat ? explicitChat[1].trim() : input;
      const installedNow = await models();
      const system = `You are the user's private BharatShop laptop AI running locally through Ollama. Your exact active model is ${MODEL}. Ollama endpoint is ${OLLAMA_BASE_URL}. The currently installed Ollama model names, which you must reproduce exactly if referenced, are: ${installedNow.join(', ') || MODEL}. The active local model is ${MODEL}; a model name ending in :cloud is only listed by Ollama and is not active unless explicitly selected. This console provides direct chat plus explicit /agency and /mcp modes. Never silently invoke external tools from bare chat. The broader BharatShop laptop stack has separate approval-gated browser, coding, company and external-provider tools, so never claim those capabilities do not exist. Do not claim all laptop data can never leave the machine: local Qwen inference uses loopback, while explicitly invoked external connectors may transmit data. Never say the model is unspecified and never invent model names. Be practical and concise.`;
      history.push({ role: 'user', content: task });
      const answer = await localChat(system, history.slice(-12));
      console.log(`\nAI> ${answer}`);
      history.push({ role: 'assistant', content: answer });
    }
  } finally {
    rl.close();
  }
}

main().catch(error => {
  console.error(`Machine AI error: ${error.message}`);
  process.exit(1);
});
