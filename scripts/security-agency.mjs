#!/usr/bin/env node

import process from 'node:process';
import { discoverAgents, resolveAgent } from './local-agency.mjs';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'qwen3.5:4b';
const mode = (process.argv[2] || 'audit').toLowerCase();
const task = process.argv.slice(3).join(' ').trim() || 'Perform a defensive cybersecurity review of BharatShop. Prioritize application security, secrets handling, dependency and supply-chain risk, browser/AI integrations, authentication, payments, database safety, logging, incident readiness, and deployment hardening. Do not attack external systems, expose secrets, or modify production data.';

const REQUIRED = [
  'security-architect',
  'security-appsec-engineer',
  'security-senior-secops',
  'security-threat-detection-engineer',
  'security-secrets-credential-engineer',
  'security-incident-responder',
  'security-ai-generated-code-auditor',
];

async function localChat(systemPrompt, messages) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      options: { num_ctx: Number(process.env.AGENCY_CONTEXT || 32768) },
    }),
  });
  if (!response.ok) throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  return payload?.message?.content?.trim() || '';
}

function securitySystemPrompt(agent) {
  return `${agent.content}\n\n---\nBHARATSHOP SECURITY DEPARTMENT\nYou are a defensive security specialist operating locally. Review only systems and code the user owns or is authorized to assess. Never request, print, or expose passwords, API keys, access tokens, private keys, cookies, or production credentials. Never attack external services. Never modify production data. Prefer read-only inspection, threat modeling, secure configuration, dependency review, detection, incident readiness, and concrete remediation. Clearly distinguish observed evidence from assumptions.`;
}

function getTeam() {
  const agents = discoverAgents();
  if (!agents.length) throw new Error('Agency catalog is not installed. Run npm.cmd run agency:setup first.');
  return REQUIRED.map(spec => resolveAgent(spec, agents));
}

async function audit() {
  const team = getTeam();
  console.log(`Security team: ${team.map(agent => agent.name).join(' + ')}`);
  const reports = [];
  for (const agent of team) {
    console.log(`\n[${agent.name}] reviewing...`);
    const answer = await localChat(securitySystemPrompt(agent), [{ role: 'user', content: task }]);
    reports.push({ name: agent.name, answer });
  }
  const synthesis = await localChat(
    'You are BharatShop CISO. Synthesize the defensive specialist reports into one prioritized security report. Use severity labels Critical/High/Medium/Low, list evidence, remediation, and verification steps. Do not invent evidence, expose secrets, attack external systems, or modify production data.',
    [{ role: 'user', content: `TASK:\n${task}\n\nREPORTS:\n${reports.map(item => `## ${item.name}\n${item.answer}`).join('\n\n')}` }],
  );
  console.log(`\n=== BharatShop Security Department Report ===\n${synthesis}\n`);
}

function status() {
  const agents = discoverAgents();
  const found = REQUIRED.map(spec => {
    try { return resolveAgent(spec, agents); } catch { return null; }
  }).filter(Boolean);
  console.log('=== BharatShop Security Department ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Security specialists ready: ${found.length}/${REQUIRED.length}`);
  for (const agent of found) console.log(`🟢 ${agent.name} — ${agent.slug}`);
  if (found.length !== REQUIRED.length) process.exitCode = 1;
}

if (mode === 'status') status();
else if (mode === 'audit') await audit();
else {
  console.error('Modes: audit | status');
  process.exit(2);
}
