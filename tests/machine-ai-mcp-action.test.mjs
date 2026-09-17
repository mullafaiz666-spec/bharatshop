import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const action = await readFile(new URL('../scripts/machine-ai-mcp-action.mjs', import.meta.url), 'utf8');
const consoleText = await readFile(new URL('../scripts/machine-ai-console.mjs', import.meta.url), 'utf8');
const chatRoute = await readFile(new URL('../src/app/api/machine-ai/chat/route.ts', import.meta.url), 'utf8');
const mcpCommand = await readFile(new URL('../src/lib/machine-ai/mcp-command.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('controlled Apper action mode exposes only the approved safe write set', () => {
  for (const name of ['create_app', 'write_files', 'patch_files', 'apply_patch']) {
    assert.match(action, new RegExp(`'${name}'`));
  }
  assert.match(action, /APPER_SAFE_WRITE_TOOLS/);
  assert.match(action, /APPER_ACTION_READ_TOOLS/);
});

test('high-risk Apper tools remain approval-gated and unavailable to Qwen action mode', () => {
  for (const name of [
    'delete_files',
    'set_env_key',
    'create_secrets',
    'delete_secret',
    'create_edge_function',
    'update_edge_function',
    'delete_edge_function',
    'connect_database',
    'update_database',
  ]) {
    assert.match(action, new RegExp(`'${name}'`));
  }
  assert.match(action, /approval-required/);
  assert.match(action, /exact-action approval is required/i);
});

test('Apper file mutations are forced to commit-only and cannot silently deploy', () => {
  assert.match(action, /value\.shouldBuild = false/);
  assert.match(action, /commit-only and cannot deploy/i);
  assert.doesNotMatch(action, /shouldBuild\s*=\s*true/);
});

test('controlled action mode uses fixed local scripts without a shell', () => {
  assert.match(action, /execFileAsync\(process\.execPath/);
  assert.match(action, /apper-mcp-client\.mjs/);
  assert.doesNotMatch(action, /shell:\s*true/);
  assert.doesNotMatch(action, /spawn\(/);
});

test('Apper app discovery is grounded by a deterministic live search_apps call', () => {
  assert.match(action, /asksForApperAppDiscovery/);
  assert.match(action, /await callApper\('search_apps', \{\}\)/);
  assert.match(action, /DETERMINISTIC LIVE TOOL RESULT/);
  assert.match(action, /Do not claim search_apps is unavailable/);
  assert.match(action, /The live Apper tools exposed for this session are/);
});

test('console and web require an explicit /mcp action command', () => {
  assert.match(consoleText, /\/mcp\\s\+action/);
  assert.match(consoleText, /runMcpAction/);
  assert.match(chatRoute, /\/mcp\\s\+action/);
  assert.match(chatRoute, /mcpActionTask/);
  assert.match(mcpCommand, /machine-ai-mcp-action\.mjs/);
});

test('package exposes a direct controlled action command', () => {
  assert.equal(pkg.scripts['machine:mcp:action'], 'node scripts/machine-ai-mcp-action.mjs');
});
