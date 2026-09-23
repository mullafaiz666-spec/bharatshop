import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineeringTaskFromPrompt, executiveOperationFromPrompt, normalizeRoute } from '../scripts/machine-ai-web.mjs';

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

test('project status bypasses Ollama and direct chat streams for long local generations', () => {
  const source = readFileSync(new URL('../scripts/machine-ai-web.mjs', import.meta.url), 'utf8');
  assert.match(source, /bharatshop\\s\+project\\s\+status/);
  assert.match(source, /async function handleDirectChat[\s\S]{0,600}stream:\s*true/);
  assert.match(source, /streamOllamaResponse\(res, response\)/);
  assert.match(source, /Agency Manager is synthesizing[\s\S]{0,1500}const answer = await nonStreamingChat/);
});

test('Machine AI exposes chat, agency, coding and executive routes', () => {
  assert.equal(normalizeRoute('chat'), 'chat');
  assert.equal(normalizeRoute('agency'), 'agency');
  assert.equal(normalizeRoute('coding'), 'coding');
  assert.equal(normalizeRoute('executive'), 'executive');
  assert.equal(normalizeRoute('unknown'), 'chat');
});

test('executive mode maps local operational intents without model inference', () => {
  assert.equal(executiveOperationFromPrompt('verify my BharatShop project is operational'), 'verify-local');
  assert.equal(executiveOperationFromPrompt('start the Machine AI supervisor'), 'machine-start');
  assert.equal(executiveOperationFromPrompt('stop agency'), 'agency-stop');
  assert.equal(executiveOperationFromPrompt('start storefront'), 'storefront-start');
  assert.equal(executiveOperationFromPrompt('explain the architecture'), '');
});

test('coding requests start Machine Engineer without a second approval turn', () => {
  const source = readFileSync(new URL('../scripts/machine-ai-web.mjs', import.meta.url), 'utf8');
  assert.match(source, /mode === 'coding' \? original : engineeringTaskFromPrompt\(original\)/);
  assert.match(source, /runCockpitOperation\('engineer-task',\{approved:true,task:engineeringTask\}\)/);
  assert.doesNotMatch(source, /savePendingApproval\(engineeringTask,mode/);
});
