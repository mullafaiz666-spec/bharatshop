import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const personalAi = readFileSync(new URL('../scripts/personal-ai.mjs', import.meta.url), 'utf8');
const personalAiSetup = readFileSync(new URL('../scripts/personal-ai-setup.mjs', import.meta.url), 'utf8');
const browserRunner = readFileSync(new URL('../services/browser-use-local/runner.py', import.meta.url), 'utf8');
const pixverse = readFileSync(new URL('../scripts/pixverse-creative.mjs', import.meta.url), 'utf8');

test('exposes one-command Personal AI setup/start/status/task scripts', () => {
  assert.equal(packageJson.scripts['ai:setup'], 'node scripts/personal-ai-setup.mjs');
  assert.equal(packageJson.scripts['ai:start'], 'node scripts/personal-ai.mjs start');
  assert.equal(packageJson.scripts['ai:status'], 'node scripts/personal-ai.mjs status');
  assert.equal(packageJson.scripts['ai:task'], 'node scripts/personal-ai.mjs task');
});

test('free/local setup installs Playwright and pins DeepSeek Harness to the local model', () => {
  assert.match(personalAiSetup, /browser-use==\$\{BROWSER_USE_VERSION\}.*playwright/s);
  assert.match(personalAiSetup, /'playwright', 'install', 'chromium'/);
  assert.match(personalAiSetup, /'launch', 'dsh', '--model', MODEL, '--config'/);
  assert.match(personalAiSetup, /qwen3\.5:4b/);
  assert.doesNotMatch(personalAiSetup, /glm-5\.3-flash:cloud/);
});

test('Personal AI routes core free capabilities through local Ollama', () => {
  assert.match(personalAi, /qwen3\.5:4b/);
  assert.match(personalAi, /'@deepseek-ai\/dsh@0\.1\.5-rc\.2', '--profile', 'headless'/);
  assert.doesNotMatch(personalAi, /'launch', 'dsh', '--model', MODEL, '--', '--profile'/);
  assert.match(personalAi, /Browser Use/);
  assert.match(personalAi, /agencyAnswer/);
  assert.match(personalAi, /runCompany/);
  assert.match(personalAi, /runPixVerse/);
  assert.doesNotMatch(personalAi, /OPENAI_API_KEY/);
  assert.doesNotMatch(personalAi, /ANTHROPIC_API_KEY/);
});

test('browser worker uses local Ollama and blocks irreversible web actions', () => {
  assert.match(browserRunner, /ChatOllama/);
  assert.match(browserRunner, /Do not make purchases, payments, publish content, send messages/);
  assert.match(browserRunner, /ANONYMIZED_TELEMETRY/);
});

test('PixVerse remains credit gated and Windows invocation bypasses cmd shims', () => {
  assert.match(pixverse, /PIXVERSE_ALLOW_CREDIT_SPEND/);
  assert.match(pixverse, /process\.execPath/);
  assert.match(pixverse, /npm-cli\.js/);
  assert.doesNotMatch(personalAi, /PIXVERSE_ALLOW_CREDIT_SPEND\s*=\s*['"]true/);
});
