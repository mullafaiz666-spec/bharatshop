#!/usr/bin/env node

import readline from 'node:readline/promises';
import process from 'node:process';
import { discoverAgents } from './local-agency.mjs';
import { chooseDepartmentAgents } from './bharatshop-operator-router.mjs';

const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || process.env.AI_TEXT_MODEL || 'qwen3.5:4b';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CONTEXT = Number(process.env.PERSONAL_AI_CONTEXT || '4096');

async function fetchJson(url, options = {}, timeoutMs = 120000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return data;
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
  const selected = chooseDepartmentAgents(agents, task);

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

async function printStatus() {
  const installed = await models();
  const agents = discoverAgents();
  console.log('\n=== BharatShop Laptop Machine AI ===');
  console.log(`OLLAMA: READY (${OLLAMA_BASE_URL})`);
  console.log(`ACTIVE MODEL: ${MODEL}`);
  console.log(`MODEL INSTALLED: ${installed.includes(MODEL) ? 'YES' : 'NO'}`);
  console.log(`INSTALLED MODELS: ${installed.join(', ') || 'none'}`);
  console.log(`AGENCY AGENTS: ${agents.length}`);
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
  console.log('THIS CONSOLE: direct local chat + explicit /agency specialist teamwork');
  console.log('BROADER LAPTOP STACK: 24x7 local task queue, local memory, Browser Use and coding/company tools through separate approval-gated commands');
  console.log('PRIVACY: this console\'s Qwen inference stays on the loopback Ollama endpoint; separately invoked external connectors may send data to their provider');
  console.log('COST: no per-token cloud billing for the active local Qwen model');
  if (cloudListed.length) console.log(`CLOUD-LISTED BUT NOT ACTIVE: ${cloudListed.join(', ')}`);
}

function asksRuntimeIdentity(input) {
  const text = String(input || '').toLowerCase();
  return /(?:what|tell me|which).*model/.test(text) && /(?:local|cloud|ollama|laptop|can you do|capabilit)/.test(text);
}

function help() {
  console.log(`\nCommands:\n  /status              show actual local runtime status\n  /about               authoritative model/local/cloud/capability info\n  /models              list actual Ollama models\n  /agency <task>       explicitly use up to 3 local specialist agents\n  /chat <task>         direct local chat\n  /help                show commands\n  /exit                exit\n\nBare text always stays in direct chat. It will never silently switch to agency/browser/company mode.`);
}

async function main() {
  const installed = await models();
  if (!installed.includes(MODEL)) throw new Error(`Required local model ${MODEL} is not installed.`);

  console.log(`\nBharatShop Laptop Machine AI - ${MODEL}`);
  console.log('Private local Ollama console. Bare text = chat; specialist teams require /agency.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history = [];
  try {
    while (true) {
      const input = (await rl.question('\nYou> ')).trim();
      if (!input) continue;
      if (input === '/exit' || input === '/quit') break;
      if (input === '/help') { help(); continue; }
      if (input === '/status') { await printStatus(); continue; }
      if (input === '/about' || asksRuntimeIdentity(input)) { await printAbout(); continue; }
      if (input === '/models' || /^ollama\s+list$/i.test(input)) {
        console.log(`\nModels: ${(await models()).join(', ') || 'none'}`);
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
      const system = `You are the user's private BharatShop laptop AI running locally through Ollama. Your exact active model is ${MODEL}. Ollama endpoint is ${OLLAMA_BASE_URL}. The currently installed Ollama model names, which you must reproduce exactly if referenced, are: ${installedNow.join(', ') || MODEL}. The active local model is ${MODEL}; a model name ending in :cloud is only listed by Ollama and is not active unless explicitly selected. This console itself provides direct chat and explicit /agency specialist reasoning. The broader BharatShop laptop stack has separate approval-gated browser, coding, company and external-provider tools, so never claim those capabilities do not exist. Do not claim all laptop data can never leave the machine: local Qwen inference uses loopback, while separately invoked external connectors may transmit data. Never say the model is unspecified and never invent model names. Be practical and concise.`;
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
