import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const action = await readFile(new URL('../scripts/machine-ai-mcp-action.mjs', import.meta.url), 'utf8');
const consoleText = await readFile(new URL('../scripts/machine-ai-console.mjs', import.meta.url), 'utf8');
const chatRoute = await readFile(new URL('../src/app/api/machine-ai/chat/route.ts', import.meta.url), 'utf8');
const mcpCommand = await readFile(new URL('../src/lib/machine-ai/mcp-command.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('Apper development mode exposes build and self-upgrade write tools', () => {
  for (const name of [
    'create_app',
    'write_files',
    'patch_files',
    'apply_patch',
    'delete_files',
    'set_env_key',
    'create_secrets',
    'create_edge_function',
    'update_edge_function',
    'delete_edge_function',
  ]) {
    assert.match(action, new RegExp(`'${name}'`));
  }
  assert.match(action, /APPER_DEVELOPER_WRITE_TOOLS/);
  assert.match(action, /FULL APPER DEVELOPMENT MODE/);
});

test('irreversible database and stored-secret deletion operations stay outside autonomous development mode', () => {
  for (const name of ['delete_secret', 'connect_database', 'update_database']) {
    assert.match(action, new RegExp(`'${name}'`));
  }
  assert.match(action, /APPER_IRREVERSIBLE_TOOLS/);
  assert.match(action, /exact-approval-required/);
});

test('Apper development mode may build and deploy when requested', () => {
  assert.doesNotMatch(action, /value\.shouldBuild = false/);
  assert.match(action, /shouldBuild=true/);
  assert.match(action, /get_build_status/);
  assert.match(action, /preview_app/);
});

test('Apper action mode still uses fixed local scripts without a shell', () => {
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

test('Apper app creation is preflighted with live create instructions and design directives', () => {
  assert.match(action, /asksForApperAppCreation/);
  assert.match(action, /get_create_app_instructions/);
  assert.match(action, /get_design_directives/);
  assert.match(action, /DETERMINISTIC APP-CREATION PREFLIGHT/);
  assert.match(action, /Create only the app explicitly requested by the user/);
});

test('console and web still require an explicit /mcp action command', () => {
  assert.match(consoleText, /\/mcp\\s\+action/);
  assert.match(consoleText, /runMcpAction/);
  assert.match(chatRoute, /\/mcp\\s\+action/);
  assert.match(chatRoute, /mcpActionTask/);
  assert.match(mcpCommand, /machine-ai-mcp-action\.mjs/);
});

test('package exposes a direct Apper development action command', () => {
  assert.equal(pkg.scripts['machine:mcp:action'], 'node scripts/machine-ai-mcp-action.mjs');
});
