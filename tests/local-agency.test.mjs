import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverAgents, resolveAgent } from '../scripts/local-agency.mjs';

function fixtureCatalog() {
  const root = mkdtempSync(join(tmpdir(), 'bharatshop-agency-'));
  mkdirSync(join(root, 'engineering'));
  writeFileSync(join(root, 'divisions.json'), JSON.stringify({
    divisions: {
      engineering: { label: 'Engineering' },
    },
  }));
  writeFileSync(join(root, 'engineering', 'engineering-frontend-developer.md'), `---\nname: Frontend Developer\ndescription: Builds local web interfaces\n---\n\nYou are a frontend specialist.\n`);
  return root;
}

test('discovers agents from upstream division format', () => {
  const agents = discoverAgents(fixtureCatalog());
  assert.equal(agents.length, 1);
  assert.equal(agents[0].slug, 'engineering-frontend-developer');
  assert.equal(agents[0].shortSlug, 'frontend-developer');
  assert.equal(agents[0].name, 'Frontend Developer');
});

test('resolves full slug, short slug, and human name', () => {
  const agents = discoverAgents(fixtureCatalog());
  assert.equal(resolveAgent('engineering-frontend-developer', agents).slug, agents[0].slug);
  assert.equal(resolveAgent('frontend-developer', agents).slug, agents[0].slug);
  assert.equal(resolveAgent('Frontend Developer', agents).slug, agents[0].slug);
});

test('local agency runtime defaults to local Ollama and contains no paid-provider endpoint', () => {
  const source = readFileSync(new URL('../scripts/local-agency.mjs', import.meta.url), 'utf8');
  assert.match(source, /qwen3\.5:4b/);
  assert.match(source, /127\.0\.0\.1:11434/);
  assert.doesNotMatch(source, /api\.openai\.com/i);
  assert.doesNotMatch(source, /api\.anthropic\.com/i);
  assert.doesNotMatch(source, /OPENAI_API_KEY|ANTHROPIC_API_KEY/);
});
