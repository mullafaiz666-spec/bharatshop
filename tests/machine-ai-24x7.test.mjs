import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const supervisor = await readFile(new URL('../scripts/machine-ai-supervisor.mjs', import.meta.url), 'utf8');
const manager = await readFile(new URL('../scripts/machine-ai-manager.mjs', import.meta.url), 'utf8');
const tasker = await readFile(new URL('../scripts/machine-ai-task.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('machine AI supervisor is local-only and never depends on Netlify storefront health', () => {
  assert.match(supervisor, /127\.0\.0\.1:11434/);
  assert.match(supervisor, /127\.0\.0\.1:11555/);
  assert.match(supervisor, /LOCAL_READY/);
  assert.doesNotMatch(supervisor, /netlify\.app|\/api\/health|BHARATSHOP_PUBLIC_ORIGIN|BHARATSHOP_AGENT_ORIGIN/i);
  assert.doesNotMatch(supervisor, /0\.0\.0\.0:11434|0\.0\.0\.0:11555/);
});

test('background machine queue is restricted to safe chat and agency routes', () => {
  assert.match(tasker, /\['chat', 'agency'\]/);
  assert.match(supervisor, /\['chat', 'agency'\]\.includes\(route\)/);
  assert.doesNotMatch(tasker, /--execute/);
  assert.doesNotMatch(supervisor, /args\.push\(['"]--execute['"]\)/);
});

test('Windows local AI startup uses user Startup folder with no elevation or scheduled task', () => {
  assert.match(manager, /Start Menu.*Programs.*Startup/s);
  assert.match(manager, /BharatShop-Local-Machine-AI\.cmd/);
  assert.doesNotMatch(manager, /Register-ScheduledTask|New-ScheduledTask|ExecutionPolicy|RunLevel Highest|schtasks/i);
});

test('package exposes separate local-machine lifecycle and queue commands', () => {
  assert.equal(pkg.scripts['machine:24x7'], 'node scripts/machine-ai-supervisor.mjs');
  assert.equal(pkg.scripts['machine:24x7:install'], 'node scripts/machine-ai-manager.mjs install');
  assert.equal(pkg.scripts['machine:24x7:start'], 'node scripts/machine-ai-manager.mjs start');
  assert.equal(pkg.scripts['machine:24x7:stop'], 'node scripts/machine-ai-manager.mjs stop');
  assert.equal(pkg.scripts['machine:24x7:status'], 'node scripts/machine-ai-manager.mjs status');
  assert.equal(pkg.scripts['machine:task'], 'node scripts/machine-ai-task.mjs');
});
