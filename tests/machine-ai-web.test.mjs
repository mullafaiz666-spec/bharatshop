import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRoute, isAllowedOrigin, isLoopbackHost } from '../scripts/machine-ai-web.mjs';

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
