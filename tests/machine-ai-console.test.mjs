import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const consoleScript = await readFile(new URL('../scripts/machine-ai-console.mjs', import.meta.url), 'utf8');
const taskScript = await readFile(new URL('../scripts/machine-ai-task.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('machine console pins the verified local model and disables hidden thinking', () => {
  assert.match(consoleScript, /qwen3\.5:4b/);
  assert.match(consoleScript, /think:\s*false/);
  assert.match(consoleScript, /127\.0\.0\.1:11434/);
  assert.doesNotMatch(consoleScript, /deepseek-v4\.1-flash:cloud/);
});

test('bare machine-console text stays chat and agency requires explicit command', () => {
  assert.match(consoleScript, /Bare text always stays in direct chat/);
  assert.match(consoleScript, /\^\\\/agency\\s\+\(\.\+\)\$/);
  assert.match(consoleScript, /never silently switch to agency\/browser\/company mode/);
});

test('runtime identity is reported from actual Ollama state rather than model guesses', () => {
  assert.match(consoleScript, /Authoritative Runtime Info/);
  assert.match(consoleScript, /INSTALLED MODELS/);
  assert.match(consoleScript, /CLOUD-LISTED BUT NOT ACTIVE/);
  assert.match(consoleScript, /asksRuntimeIdentity/);
  assert.match(consoleScript, /never invent model names/i);
});

test('privacy statement distinguishes local inference from external connectors', () => {
  assert.match(consoleScript, /loopback Ollama endpoint/);
  assert.match(consoleScript, /external connectors may send data to their provider/);
  assert.doesNotMatch(consoleScript, /No data is sent to external servers/);
});

test('background machine tasks default to chat and allow only chat or agency', () => {
  assert.match(taskScript, /let route = 'chat'/);
  assert.match(taskScript, /\['chat', 'agency'\]\.includes\(route\)/);
});

test('package exposes dedicated machine chat command', () => {
  assert.equal(pkg.scripts['machine:chat'], 'node scripts/machine-ai-console.mjs');
});
