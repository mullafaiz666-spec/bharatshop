import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRoute, isAllowedOrigin, isLoopbackHost, buildMemoryContext, buildReadOnlyProjectContext } from '../scripts/machine-ai-web.mjs';
import { classifyDepartments, chooseDepartmentAgents } from '../scripts/bharatshop-operator-router.mjs';
import { isMachineAiStatus } from '../scripts/machine-ai-web-readiness.mjs';

test('machine web UI defaults background/chat routing safely', () => {
  assert.equal(normalizeRoute('agency'), 'agency');
  assert.equal(normalizeRoute('chat'), 'chat');
  assert.equal(normalizeRoute('build'), 'chat');
  assert.equal(normalizeRoute('browser'), 'chat');
});

test('machine web UI accepts only loopback host/origin on default port', () => {
  assert.equal(isLoopbackHost('127.0.0.1:3002'), true);
  assert.equal(isLoopbackHost('localhost:3002'), true);
  assert.equal(isLoopbackHost('192.168.1.20:3002'), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3002'), true);
  assert.equal(isAllowedOrigin('http://localhost:3002'), true);
  assert.equal(isAllowedOrigin('https://example.com'), false);
});

test('UI ships as local static assets with no external CDN dependency', () => {
  const html = readFileSync(resolve('machine-ui/index.html'), 'utf8');
  const js = readFileSync(resolve('machine-ui/app.js'), 'utf8');
  assert.match(html, /BharatShop Machine AI/);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.match(js, /\/api\/chat/);
  assert.match(js, /\/api\/agents/);
  assert.match(js, /\/api\/memory/);
});

test('machine web readiness rejects an unrelated healthy web server', () => {
  assert.equal(isMachineAiStatus({}), false);
  assert.equal(isMachineAiStatus({ ollama: { ready: true }, shim: { ready: true }, agents: 264 }), true);
  assert.equal(isMachineAiStatus({ ollama: { ready: true }, shim: { ready: true }, agents: '264' }), false);
});

test('machine web chat is bounded and the UI exposes cancellation', () => {
  const server = readFileSync(resolve('scripts/machine-ai-web.mjs'), 'utf8');
  const ui = readFileSync(resolve('machine-ui/app.js'), 'utf8');
  assert.match(server, /BHARATSHOP_CHAT_TIMEOUT_MS\s*\|\|\s*'90000'/);
  assert.match(server, /num_predict:\s*CHAT_PREDICT_TOKENS/);
  assert.match(server, /req\.once\('aborted',\s*closed\)/);
  assert.match(ui, /state\.activeController\?\.abort\(\)/);
  assert.match(ui, /signal:\s*state\.activeController\.signal/);
  assert.match(server, /needsProjectGrounding/);
});

test('BharatShop checkout routes to commerce engineering rather than world-building research', () => {
  const departments = classifyDepartments('Review the BharatShop checkout payment code locally');
  assert.ok(departments.includes('commerce'));
  assert.ok(departments.includes('software-engineering'));
  assert.equal(departments.includes('general-research'), false);
});

test('BharatDrip checkout keeps commerce priority over fashion keyword routing', () => {
  const departments = classifyDepartments('Review BharatDrip checkout payment flow');
  assert.ok(departments.includes('commerce'));
  assert.ok(departments.includes('software-engineering'));
});

test('stale world-building agent selection cannot hijack BharatShop engineering tasks', () => {
  const agents = [{ slug: 'anthropologist', shortSlug: 'anthropologist', name: 'Anthropologist', description: 'culture society specialist', division: 'Research', content: 'world building' }];
  const selected = chooseDepartmentAgents(agents, 'Fix BharatShop checkout payment bug', ['anthropologist']);
  assert.notEqual(selected[0]?.name, 'Anthropologist');
  assert.ok(selected.some(agent => agent.operatorDomain === 'commerce' || agent.operatorDomain === 'software-engineering'));
});

test('chat grounding wires bounded persistent memory and live read-only repository evidence', () => {
  const memory = buildMemoryContext('Review BharatShop checkout payment code');
  assert.match(memory, /PERSISTENT BHARATSHOP MEMORY/);
  assert.ok(memory.length <= 8000);

  // CI runners intentionally do not contain the owner's laptop memory. Verify
  // the four-store grounding wiring from tracked source rather than requiring
  // private persisted data to exist in the test environment.
  const server = readFileSync(resolve('scripts/machine-ai-web.mjs'), 'utf8');
  assert.match(server, /\['WORKING',\s*pickMemory\('working'/);
  assert.match(server, /\['PERSONAL',\s*pickMemory\('personal'/);
  assert.match(server, /\['SEMANTIC',\s*pickMemory\('semantic'/);
  assert.match(server, /\['EPISODIC',\s*pickMemory\('episodic'/);

  const project = buildReadOnlyProjectContext('Review BharatShop checkout payment code');
  assert.match(project, /LIVE READ-ONLY REPOSITORY STATE/);
  assert.match(project, /Branch:/);
  assert.ok(project.length <= 7000);
});
