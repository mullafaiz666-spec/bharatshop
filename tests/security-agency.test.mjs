import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const securityAgency = readFileSync(new URL('../scripts/security-agency.mjs', import.meta.url), 'utf8');
const browserRunner = readFileSync(new URL('../services/browser-use-local/runner.py', import.meta.url), 'utf8');

test('exposes dedicated BharatShop security department commands', () => {
  assert.equal(packageJson.scripts['security:status'], 'node scripts/security-agency.mjs status');
  assert.equal(packageJson.scripts['security:audit'], 'node scripts/security-agency.mjs audit');
});

test('security department requires core defensive specialists', () => {
  for (const slug of [
    'security-architect',
    'security-appsec-engineer',
    'security-senior-secops',
    'security-threat-detection-engineer',
    'security-secrets-credential-engineer',
    'security-incident-responder',
    'security-ai-generated-code-auditor',
  ]) {
    assert.match(securityAgency, new RegExp(slug));
  }
});

test('security department is local and defensive by design', () => {
  assert.match(securityAgency, /qwen3\.5:4b/);
  assert.match(securityAgency, /Never attack external services/);
  assert.match(securityAgency, /Never modify production data/);
  assert.match(securityAgency, /Never request, print, or expose passwords/);
  assert.doesNotMatch(securityAgency, /OPENAI_API_KEY|ANTHROPIC_API_KEY/);
});

test('browser worker disables Browser Use bundled extensions by default', () => {
  assert.match(browserRunner, /BROWSER_USE_DISABLE_EXTENSIONS/);
});
