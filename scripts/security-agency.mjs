#!/usr/bin/env node

import process from 'node:process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { discoverAgents, resolveAgent } from './local-agency.mjs';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'qwen3.5:4b';
const mode = (process.argv[2] || 'audit').toLowerCase();
const task = process.argv.slice(3).join(' ').trim() || 'Perform a defensive cybersecurity review of BharatShop. Prioritize application security, secrets handling, dependency and supply-chain risk, browser/AI integrations, authentication, payments, database safety, logging, incident readiness, and deployment hardening. Do not attack external systems, expose secrets, or modify production data.';
const LLM_TIMEOUT_MS = Number(process.env.SECURITY_LLM_TIMEOUT_MS || 600000);
const LLM_RETRIES = Number(process.env.SECURITY_LLM_RETRIES || 2);
const SYNTHESIS_TIMEOUT_MS = Number(process.env.SECURITY_SYNTHESIS_TIMEOUT_MS || 180000);
const SYNTHESIS_RETRIES = Number(process.env.SECURITY_SYNTHESIS_RETRIES || 0);
const SECURITY_CONTEXT = Number(process.env.SECURITY_CONTEXT || 8192);
const MAX_AGENT_PROMPT_CHARS = Number(process.env.SECURITY_AGENT_PROMPT_CHARS || 9000);
const MAX_REPORT_CHARS = Number(process.env.SECURITY_REPORT_CHARS || 4500);
const SYNTHESIS_REPORT_CHARS = Number(process.env.SECURITY_SYNTHESIS_REPORT_CHARS || 1800);

const REQUIRED = [
  'security-architect',
  'security-appsec-engineer',
  'security-senior-secops',
  'security-threat-detection-engineer',
  'security-secrets-credential-engineer',
  'security-incident-responder',
  'security-ai-generated-code-auditor',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function postJson(urlString, payload, timeoutMs = LLM_TIMEOUT_MS) {
  const url = new URL(urlString);
  const body = JSON.stringify(payload);
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = transport({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
          reject(new Error(`Ollama request failed (${res.statusCode}): ${data.slice(0, 1000)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Ollama returned invalid JSON: ${error.message}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Ollama request timed out after ${Math.round(timeoutMs / 1000)} seconds`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function localChat(systemPrompt, messages, options = {}) {
  const timeoutMs = options.timeoutMs ?? LLM_TIMEOUT_MS;
  const retries = options.retries ?? LLM_RETRIES;
  const payload = {
    model: MODEL,
    stream: false,
    think: false,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    options: {
      num_ctx: SECURITY_CONTEXT,
      num_predict: Number(options.numPredict ?? process.env.SECURITY_NUM_PREDICT ?? 1000),
      temperature: Number(process.env.SECURITY_TEMPERATURE || 0.2),
    },
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await postJson(`${OLLAMA_BASE_URL}/api/chat`, payload, timeoutMs);
      const content = response?.message?.content?.trim() || '';
      if (!content) throw new Error('Ollama returned an empty response');
      return content;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      console.warn(`Ollama attempt ${attempt + 1} failed: ${error.message}. Retrying...`);
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

function compactAgentContent(content) {
  if (content.length <= MAX_AGENT_PROMPT_CHARS) return content;
  const headChars = Math.floor(MAX_AGENT_PROMPT_CHARS * 0.75);
  const tailChars = MAX_AGENT_PROMPT_CHARS - headChars;
  return `${content.slice(0, headChars)}\n\n[...security persona condensed for local runtime...]\n\n${content.slice(-tailChars)}`;
}

function securitySystemPrompt(agent) {
  return `${compactAgentContent(agent.content)}\n\n---\nBHARATSHOP SECURITY DEPARTMENT\nYou are a defensive security specialist operating locally. Review only systems and code the user owns or is authorized to assess. Never request, print, or expose passwords, API keys, access tokens, private keys, cookies, or production credentials. Never attack external services. Never modify production data. Prefer read-only inspection, threat modeling, secure configuration, dependency review, detection, incident readiness, and concrete remediation. Keep the response concise and prioritized so it runs reliably on the local model. Clearly distinguish observed evidence from assumptions.`;
}

function getTeam() {
  const agents = discoverAgents();
  if (!agents.length) throw new Error('Agency catalog is not installed. Run npm.cmd run agency:setup first.');
  return REQUIRED.map(spec => resolveAgent(spec, agents));
}

function printFallbackReport(reports, reason) {
  console.warn(`\nCISO synthesis unavailable: ${reason}`);
  console.log('\n=== BharatShop Security Department Report (specialist fallback) ===');
  console.log('All available specialist findings are preserved below. This fallback is used instead of printing an empty report.');
  for (const report of reports) {
    const state = report.ok ? 'COMPLETE' : 'UNAVAILABLE';
    console.log(`\n## ${report.name} [${state}]\n${report.answer}\n`);
  }
}

async function audit() {
  const team = getTeam();
  console.log(`Security team: ${team.map(agent => agent.name).join(' + ')}`);
  console.log(`Local runtime: ${MODEL}, context=${SECURITY_CONTEXT}, timeout=${Math.round(LLM_TIMEOUT_MS / 1000)}s, retries=${LLM_RETRIES}`);
  console.log(`CISO synthesis: timeout=${Math.round(SYNTHESIS_TIMEOUT_MS / 1000)}s, retries=${SYNTHESIS_RETRIES}`);
  const reports = [];

  for (const agent of team) {
    console.log(`\n[${agent.name}] reviewing...`);
    try {
      const answer = await localChat(securitySystemPrompt(agent), [{ role: 'user', content: task }]);
      reports.push({ name: agent.name, answer: answer.slice(0, MAX_REPORT_CHARS), ok: true });
      console.log(`[${agent.name}] complete.`);
    } catch (error) {
      console.warn(`[${agent.name}] unavailable after retries: ${error.message}`);
      reports.push({ name: agent.name, answer: `Specialist unavailable after local runtime retries: ${error.message}`, ok: false });
    }
  }

  const successful = reports.filter(report => report.ok);
  if (!successful.length) {
    throw new Error('All security specialists failed to obtain a local Ollama response. Confirm Ollama is running and retry.');
  }

  const synthesisInput = reports
    .map(item => `## ${item.name}\n${item.answer.slice(0, SYNTHESIS_REPORT_CHARS)}`)
    .join('\n\n');

  try {
    const synthesis = await localChat(
      'You are BharatShop CISO. Synthesize the defensive specialist reports into one concise prioritized security report. Use severity labels Critical/High/Medium/Low, list evidence, remediation, and verification steps. Treat unavailable specialists as gaps, not findings. Do not invent evidence, expose secrets, attack external systems, or modify production data.',
      [{ role: 'user', content: `TASK:\n${task}\n\nREPORTS:\n${synthesisInput}` }],
      { timeoutMs: SYNTHESIS_TIMEOUT_MS, retries: SYNTHESIS_RETRIES, numPredict: 800 },
    );
    console.log(`\n=== BharatShop Security Department Report ===\n${synthesis}\n`);
  } catch (error) {
    printFallbackReport(reports, error.message);
  }
}

function status() {
  const agents = discoverAgents();
  const found = REQUIRED.map(spec => {
    try { return resolveAgent(spec, agents); } catch { return null; }
  }).filter(Boolean);
  console.log('=== BharatShop Security Department ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Security specialists ready: ${found.length}/${REQUIRED.length}`);
  console.log(`Audit runtime: context=${SECURITY_CONTEXT}, timeout=${Math.round(LLM_TIMEOUT_MS / 1000)}s, retries=${LLM_RETRIES}`);
  console.log(`CISO synthesis: timeout=${Math.round(SYNTHESIS_TIMEOUT_MS / 1000)}s, retries=${SYNTHESIS_RETRIES}`);
  for (const agent of found) console.log(`🟢 ${agent.name} — ${agent.slug}`);
  if (found.length !== REQUIRED.length) process.exitCode = 1;
}

if (mode === 'status') status();
else if (mode === 'audit') await audit();
else {
  console.error('Modes: audit | status');
  process.exit(2);
}
