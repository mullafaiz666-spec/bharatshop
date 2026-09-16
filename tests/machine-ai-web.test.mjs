import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRoute, isAllowedOrigin, isLoopbackHost, buildMemoryContext, buildReadOnlyProjectContext } from '../scripts/machine-ai-web.mjs';
import { classifyDepartments, chooseDepartmentAgents } from '../scripts/bharatshop-operator-router.mjs';

test('machine web UI defaults background/chat routing safely', () => {
  assert.equal(normalizeRoute('agency'), 'agency');
  assert.equal(normalizeRoute('chat'), 'chat');
  assert.equal(normalizeRoute('build'), 'chat');
  assert.equal(normalizeRoute('browser'), 'chat');
});

test('machine web UI accepts only loopback host/origin on default port', () => {
  assert.equal(isLoopbackHost('127.0.0.1:3001'), true);
  assert.equal(isLoopbackHost('localhost:3001'), true);
  assert.equal(isLoopbackHost('192.168.1.20:3001'), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3001'), true);
  assert.equal(isAllowedOrigin('http://localhost:3001'), true);
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


test('BharatShop checkout routes to commerce engineering rather than world-building research',()=>{const d=classifyDepartments('Review the BharatShop checkout payment code locally');assert.ok(d.includes('commerce'));assert.ok(d.includes('software-engineering'));assert.equal(d.includes('general-research'),false);});

test('BharatDrip checkout keeps commerce priority over fashion keyword routing',()=>{const d=classifyDepartments('Review BharatDrip checkout payment flow');assert.ok(d.includes('commerce'));assert.ok(d.includes('software-engineering'));});

test('stale world-building agent selection cannot hijack BharatShop engineering tasks',()=>{const agents=[{slug:'anthropologist',shortSlug:'anthropologist',name:'Anthropologist',description:'culture society specialist',division:'Research',content:'world building'}];const selected=chooseDepartmentAgents(agents,'Fix BharatShop checkout payment bug',['anthropologist']);assert.notEqual(selected[0]?.name,'Anthropologist');assert.ok(selected.some(agent=>agent.operatorDomain==='commerce'||agent.operatorDomain==='software-engineering'));});

test('chat grounding exposes persistent memory and live read-only repository evidence',()=>{const memory=buildMemoryContext('BharatShop BharatDrip streetwear database DROP TRUNCATE owner preferences P0 backlog');assert.match(memory,/PERSISTENT BHARATSHOP MEMORY/);assert.match(memory,/BharatDrip/i);assert.match(memory,/streetwear/i);assert.match(memory,/(DROP|TRUNCATE)/i);assert.match(memory,/P0/i);const project=buildReadOnlyProjectContext('Review BharatShop checkout payment code');assert.match(project,/LIVE READ-ONLY REPOSITORY STATE/);assert.match(project,/Branch:/);});
