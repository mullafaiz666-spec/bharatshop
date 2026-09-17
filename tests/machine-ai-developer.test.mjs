import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const developer = await readFile(new URL('../scripts/machine-ai-developer.mjs', import.meta.url), 'utf8');
const control = await readFile(new URL('../src/app/api/machine-ai/control/route.ts', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/lib/machine-ai/control-auth.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('developer runner has project write, validation, build, commit and push tools', () => {
  for (const tool of [
    'dev__write_file',
    'dev__delete_file',
    'dev__typecheck',
    'dev__tests',
    'dev__build',
    'dev__install',
    'dev__git_commit',
    'dev__git_push',
  ]) {
    assert.match(developer, new RegExp(tool));
  }
  assert.match(developer, /feature\/machine-ai-mcp-host-v1/);
  assert.match(developer, /git', \['push', 'origin'/);
  assert.doesNotMatch(developer, /--force/);
});

test('developer runner blocks credential-bearing paths and secret material', () => {
  assert.match(developer, /protectedPath/);
  assert.match(developer, /\.env/);
  assert.match(developer, /PRIVATE KEY/);
  assert.match(developer, /Refusing to write credential material/);
});

test('operational control endpoint supports chat agency queue developer and apper actions', () => {
  for (const action of ['chat', 'agency', 'queue', 'developer', 'apper']) {
    assert.match(control, new RegExp(`action === \\"${action}\\"`));
  }
  assert.match(control, /authorizeMachineControl/);
});

test('control bridge is paired to the exact Apper preview origin and token header', () => {
  assert.match(auth, /preview--nimble-bharatshop-control\.apper\.so/);
  assert.match(auth, /x-bharatshop-control-token/i);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /control-token\.txt/);
  assert.match(auth, /access-control-allow-private-network/);
});

test('package exposes machine developer mode', () => {
  assert.equal(pkg.scripts['machine:dev'], 'node scripts/machine-ai-developer.mjs');
});
