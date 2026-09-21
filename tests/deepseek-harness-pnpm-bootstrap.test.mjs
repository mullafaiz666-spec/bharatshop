import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/deepseek-harness.mjs', import.meta.url), 'utf8');

test('DeepSeek Harness bootstraps pnpm locally when Windows PATH lacks pnpm', () => {
  assert.match(source, /LOCAL_TOOLS_HOME/);
  assert.match(source, /LOCAL_TOOLS_BIN/);
  assert.match(source, /PNPM_SPEC/);
  assert.match(source, /function ensurePnpmEnv/);
  assert.match(source, /npm', \[/);
  assert.match(source, /'--prefix', LOCAL_TOOLS_HOME/);
  assert.match(source, /'--no-audit'/);
  assert.match(source, /pnpmAvailable/);
  assert.match(source, /subagents[\s\S]*ensurePnpmEnv/);
});

test('DeepSeek Harness injects local pnpm bin into child PATH', () => {
  assert.match(source, /withLocalToolPath/);
  assert.match(source, /LOCAL_TOOLS_BIN/);
  assert.match(source, /next\.PATH = combined/);
  assert.match(source, /npxDsh\(dshArgs, env = withLocalToolPath\(safeHarnessEnv\(\)\)\)/);
});


test('Machine Engineer parent model is local Ollama and does not require a DeepSeek API key', () => {
  assert.match(source, /LOCAL_ENGINEER_MODEL/);
  assert.match(source, /LOCAL_OLLAMA_OPENAI_BASE_URL/);
  assert.match(source, /function ensureLocalOllamaSettings/);
  assert.match(source, /provider: ollama/);
  assert.match(source, /api: openai-completions/);
  assert.match(source, /apiKeyEnv: OLLAMA_API_KEY/);
  assert.match(source, /env\.OLLAMA_API_KEY = 'ollama-local'/);
  assert.match(source, /no DeepSeek API key is required/);
  assert.doesNotMatch(source, /env\.DEEPSEEK_API_KEY\s*=/);
});

test('local Ollama settings preserve an existing unmanaged Harness settings backup', () => {
  assert.match(source, /settings\.before-bharatshop-local-/);
  assert.match(source, /managed-by: bharatshop-local-engineer/);
  assert.match(source, /cpSync\(SETTINGS_PATH, backupPath\)/);
});


test('local Ollama settings writer imports writeFileSync', () => {
  assert.match(source, /import \{[^\n]*writeFileSync[^\n]*\} from 'node:fs'/);
  assert.match(source, /writeFileSync\(SETTINGS_PATH, settings, 'utf8'\)/);
});


test('local engineering tasks use the official Ollama DSH launcher with bounded timeouts', () => {
  assert.match(source, /function runOfficialOllamaDshTask/);
  assert.match(source, /'launch',\s*'dsh'/);
  assert.match(source, /'--model',\s*LOCAL_ENGINEER_MODEL/);
  assert.match(source, /LOCAL_DSH_SMOKE_TIMEOUT_MS/);
  assert.match(source, /LOCAL_DSH_TASK_TIMEOUT_MS/);
  assert.match(source, /case 'smoke'/);
  assert.match(source, /timeout:/);
  assert.match(source, /ETIMEDOUT/);
});

test('local engineering parent run does not require paid provider credentials', () => {
  assert.match(source, /does not require a DeepSeek API key/);
  assert.match(source, /Do not require DeepSeek, OpenAI, Anthropic, or other paid API credentials/);
});
