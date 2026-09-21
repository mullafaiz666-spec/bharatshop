import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineeringTaskFromPrompt } from '../scripts/machine-ai-web.mjs';

test('fix and build requests route to Machine Engineer intent', () => {
  assert.equal(engineeringTaskFromPrompt('/fix checkout retry bug'), 'checkout retry bug');
  assert.equal(engineeringTaskFromPrompt('build BharatShop storefront'), 'build BharatShop storefront');
  assert.equal(engineeringTaskFromPrompt('repair the project API integration'), 'repair the project API integration');
  assert.equal(engineeringTaskFromPrompt('explain checkout architecture'), '');
  assert.equal(engineeringTaskFromPrompt('what is the weather'), '');
});

test('Machine Engineer preserves dirty local work instead of requiring a clean tree', () => {
  const source = readFileSync(new URL('../scripts/machine-ai-engineer.mjs', import.meta.url), 'utf8');
  assert.match(source, /snapshotBaseline\(preflight\)/);
  assert.match(source, /git\(\['diff', '--binary', 'HEAD'\]/);
  assert.match(source, /never reset, clean, checkout-overwrite, or discard unrelated work/);
  assert.doesNotMatch(source, /Refusing to start from a dirty worktree/);
});

test('chat approval starts engineer operation rather than only resuming read-only chat', () => {
  const source = readFileSync(new URL('../scripts/machine-ai-web.mjs', import.meta.url), 'utf8');
  assert.match(source, /resumed\.action==='engineer-task'/);
  assert.match(source, /runCockpitOperation\('engineer-task',\{approved:true,task:resumed\.task\}\)/);
  assert.match(source, /action:'engineer-task'/);
});
