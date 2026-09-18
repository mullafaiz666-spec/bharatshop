import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { operationCatalog, runCockpitOperation } from '../scripts/machine-cockpit-ops.mjs';

test('cockpit exposes only the fixed local operation allowlist', () => {
  const ids = operationCatalog().map(item => item.id).sort();
  assert.deepEqual(ids, [
    'agency-start',
    'agency-status',
    'agency-stop',
    'engineer-status',
    'engineer-task',
    'machine-start',
    'machine-status',
    'machine-stop',
    'verify-local',
  ]);
  assert.equal(ids.some(id => /deploy|publish|payment|database|shell/i.test(id)), false);
});

test('cockpit rejects arbitrary command names', async () => {
  await assert.rejects(() => runCockpitOperation('powershell -Command whoami', {}), /Unsupported cockpit operation/);
});

test('state-changing cockpit controls require explicit local approval', async () => {
  await assert.rejects(() => runCockpitOperation('machine-start', {}), /Explicit local approval/);
  await assert.rejects(() => runCockpitOperation('engineer-task', { task: 'Fix a test' }), /Explicit local approval/);
});

test('web server and UI wire the operations cockpit', () => {
  const server = readFileSync(resolve('scripts/machine-ai-web.mjs'), 'utf8');
  const ui = readFileSync(resolve('machine-ui/app.js'), 'utf8');
  const html = readFileSync(resolve('machine-ui/index.html'), 'utf8');
  assert.match(server, /\/api\/operations/);
  assert.match(server, /runCockpitOperation/);
  assert.match(ui, /openOperations/);
  assert.match(ui, /engineer-task/);
  assert.match(ui, /verify-local/);
  assert.match(html, /data-drawer="operations"/);
});

test('cockpit source keeps production-risk operations out of its action map', () => {
  const source = readFileSync(resolve('scripts/machine-cockpit-ops.mjs'), 'utf8');
  const actionBlock = source.slice(source.indexOf('const ACTIONS'), source.indexOf('function safeChildEnv'));
  assert.doesNotMatch(actionBlock, /deploy|publish|razorpay|cashfree|shopify|database/i);
});
