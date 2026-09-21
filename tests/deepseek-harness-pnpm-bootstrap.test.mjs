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
