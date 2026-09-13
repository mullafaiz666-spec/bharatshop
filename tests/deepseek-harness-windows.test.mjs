import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const launcherUrl = new URL('../scripts/deepseek-harness.mjs', import.meta.url);

test('DeepSeek Harness avoids direct npm.cmd/npx.cmd spawning on Windows', async () => {
  const source = await readFile(launcherUrl, 'utf8');

  assert.doesNotMatch(source, /['"]npm\.cmd['"]/);
  assert.doesNotMatch(source, /['"]npx\.cmd['"]/);
  assert.match(source, /function resolveNpmCli\(/);
  assert.match(source, /process\.execPath/);
  assert.match(source, /npm-cli\.js/);
  assert.match(source, /npx-cli\.js/);
});
