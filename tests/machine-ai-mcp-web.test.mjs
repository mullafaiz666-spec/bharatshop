import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const chatRoute = await readFile(new URL('../src/app/api/machine-ai/chat/route.ts', import.meta.url), 'utf8');
const mcpRoute = await readFile(new URL('../src/app/api/machine-ai/mcp/route.ts', import.meta.url), 'utf8');
const mcpCommand = await readFile(new URL('../src/lib/machine-ai/mcp-command.ts', import.meta.url), 'utf8');
const mcpPanel = await readFile(new URL('../src/components/machine-ai/McpPanel.tsx', import.meta.url), 'utf8');
const machinePage = await readFile(new URL('../src/app/machine-ai/page.tsx', import.meta.url), 'utf8');
const mcpChat = await readFile(new URL('../scripts/machine-ai-mcp-chat.mjs', import.meta.url), 'utf8');

test('web chat intercepts audit and MCP commands before ordinary Ollama chat', () => {
  assert.match(chatRoute, /lower === "\/audit"/);
  assert.match(chatRoute, /lower === "\/mcp status"/);
  assert.match(chatRoute, /\/mcp\\s\+tools/);
  assert.match(chatRoute, /\/mcp\\s\+test/);
  assert.match(chatRoute, /deterministicCommand\(lastUser, route\)/);
  assert.match(chatRoute, /if \(commandResponse\) return commandResponse/);
});

test('ordinary chat keeps explicit local and agency routes and does not auto-enable MCP', () => {
  assert.match(chatRoute, /String\(body\.route \|\| "chat"\)/);
  assert.doesNotMatch(chatRoute, /route\s*===\s*"mcp"/);
  assert.match(chatRoute, /openOllamaStream/);
});

test('MCP API remains loopback-only and allowlists commands', () => {
  assert.match(mcpRoute, /isLoopbackRequest\(request\)/);
  assert.match(mcpRoute, /localOnlyError\(\)/);
  assert.match(mcpRoute, /\["status", "tools", "test"\]/);
  assert.doesNotMatch(mcpRoute, /POST\s*\(/);
});

test('web MCP bridge uses execFile with fixed scripts and connector allowlist', () => {
  assert.match(mcpCommand, /execFileAsync\(process\.execPath/);
  assert.match(mcpCommand, /mcp-auth-bridge\.mjs/);
  assert.match(mcpCommand, /machine-ai-mcp-chat\.mjs/);
  assert.match(mcpCommand, /\["all", "github", "supabase", "apper", "local"\]/);
  assert.doesNotMatch(mcpCommand, /shell:\s*true/);
});

test('audit reports measured MCP state and never claims production writes', () => {
  assert.match(mcpCommand, /MCP SYSTEM =/);
  assert.match(mcpCommand, /No production writes, deploys, merges, payments, or destructive database actions/);
});

test('MCP dashboard visibly exposes GitHub, Supabase, Apper and Local Tools', () => {
  assert.match(mcpPanel, /MCP Connectors/);
  assert.match(mcpPanel, /\["github", "supabase", "apper", "local"\]/);
  assert.match(mcpPanel, /Discovered read-only tools/);
  assert.match(mcpPanel, /Blocked write tools/);
  assert.match(mcpPanel, /Run read-only test/);
  assert.match(machinePage, /\/machine-ai\/mcp/);
});

test('MCP Ollama tool mode retries only transient connection failures', () => {
  assert.match(mcpChat, /ECONNRESET/);
  assert.match(mcpChat, /transientOllamaError/);
  assert.match(mcpChat, /await delay\(500\)/);
  assert.match(mcpChat, /round < 5/);
});
