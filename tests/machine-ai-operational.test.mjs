import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const operationalUrl = new URL('../scripts/machine-ai-operational.mjs', import.meta.url);
const deployUrl = new URL('../scripts/deploy-operational-control-center.mjs', import.meta.url);
const operational = await readFile(operationalUrl, 'utf8');
const deploy = await readFile(deployUrl, 'utf8');

test('operational orchestrator is syntactically valid and targets the renamed branch', async () => {
  await execFileAsync(process.execPath, ['--check', operationalUrl.pathname]);
  assert.match(operational, /feature\/machine-ai-operational-control/);
  assert.doesNotMatch(operational, /feature\/machine-ai-mcp-host-v1/);
});

test('operational orchestrator automates sync, supervisor, web runtime and conditional preview deployment', () => {
  assert.match(operational, /pull', '--ff-only'/);
  assert.match(operational, /machine-ai-manager\.mjs/);
  assert.match(operational, /next', 'dist', 'bin', 'next/);
  assert.match(operational, /deployIfNeeded/);
  assert.match(operational, /control-center-deploy\.json/);
  assert.match(operational, /--no-sync --no-deploy --no-open/);
});

test('operational orchestration avoids irreversible production operations', () => {
  assert.doesNotMatch(operational, /push[^\n]*--force/);
  assert.doesNotMatch(operational, /update_database|connect_database|delete_secret/);
});

test('Control Center deployment source is syntactically valid and no longer nests the broken template literal', async () => {
  await execFileAsync(process.execPath, ['--check', deployUrl.pathname]);
  assert.doesNotMatch(deploy, /setOutput\(`Task queued successfully/);
  assert.match(deploy, /Task queued successfully/);
});
