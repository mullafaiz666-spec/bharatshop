import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const script = readFileSync(join(root, 'scripts', 'machine-ai-engineer.mjs'), 'utf8');

test('machine engineer refuses protected branches and preserves dirty local starts', () => {
  assert.match(script, /repair\|fix\|feature\|chore\|test\|ai/);
  assert.match(script, /Refusing engineering mutations/);
  assert.match(script, /snapshotBaseline/);
  assert.match(script, /diff', '--binary', 'HEAD'/);
  assert.match(script, /never reset, clean, checkout-overwrite, or discard unrelated work/);
  assert.doesNotMatch(script, /Refusing to start from a dirty worktree/);
});

test('machine engineer blocks secret-bearing worktrees and secret env forwarding', () => {
  assert.match(script, /secret-bearing workspace files/);
  assert.match(script, /\.env/);
  assert.match(script, /DATABASE\|POSTGRES/);
  assert.match(script, /SECRET\|TOKEN\|PASSWORD/);
});

test('machine engineer delegates through guarded Harness and independently verifies', () => {
  assert.match(script, /deepseek-harness\.mjs/);
  assert.match(script, /subagent_codex/);
  assert.match(script, /subagent_claude_code/);
  for (const required of ['typecheck', 'test:integrations', 'lint', 'build']) {
    assert.match(script, new RegExp(required.replace(':', '\\:')));
  }
  assert.match(script, /git', args: \['diff', '--check'\]/);
});

test('machine engineer never auto commits, pushes, merges or deploys', () => {
  assert.match(script, /Do not commit, push, merge, deploy, publish/);
  assert.match(script, /Changes remain uncommitted/);
  assert.doesNotMatch(script, /git\(\['(?:commit|push|merge|reset)',/);
});
