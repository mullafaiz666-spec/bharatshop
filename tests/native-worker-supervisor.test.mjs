import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../scripts/workers/native-company-worker.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function scenario(mode) {
  const queries = [], logs = [], kills = [];
  let done;
  const ended = new Promise(resolve => { done = resolve; });
  const process = Object.assign(new EventEmitter(), { argv: ['node', 'worker.cjs'], env: {} });
  const child = new EventEmitter();
  child.kill = signal => { kills.push(signal); queueMicrotask(() => child.emit('exit', null)); };
  const dependencies = {
    '@/db': { pool: { query: async (...args) => { queries.push(args); return { rows: [] }; }, end: async () => done() } },
    '@/lib/agents/company-state': { claimQueuedWork: async limit => { assert.equal(limit, 1); return mode === 'empty' ? [] : [{ id: 'work-1' }]; } },
    '@/lib/agents/company-runtime': { executeCompanyWorkItem() { throw new Error('parent must not execute tasks directly'); } },
    'node:child_process': { fork: (_file, args, options) => {
      assert.deepEqual(Array.from(args), ['--execute', 'work-1']);
      assert.deepEqual(Array.from(options.stdio), ['ignore', 'ignore', 'ignore', 'ipc']);
      if (mode !== 'timeout') queueMicrotask(() => child.emit('exit', mode === 'success' ? 0 : 1));
      return child;
    } },
  };
  runInNewContext(source, { exports: {}, require: key => dependencies[key], process, __filename: 'worker.cjs',
    console: { log: value => logs.push(value), error: value => logs.push(value) },
    setTimeout: callback => { if (mode === 'timeout') queueMicrotask(callback); return 1; }, clearTimeout() {},
  });
  await ended;
  return { queries, logs, kills, exitCode: process.exitCode };
}
test('empty native queue executes nothing', async () => {
  const result = await scenario('empty');
  assert.equal(result.queries.length, 0);
  assert.equal(result.kills.length, 0);
});
test('completed worker process is not requeued or overwritten', async () => {
  const result = await scenario('success');
  assert.equal(result.queries.length, 0);
  assert.equal(result.kills.length, 0);
});
test('failed child holds only still-running work for review', async () => {
  const result = await scenario('failure');
  assert.equal(result.exitCode, 1);
  assert(result.queries.length > 0);
  assert.match(result.queries[0][0], /WHERE id=\$1 AND status='RUNNING'/);
  assert.equal(JSON.parse(result.queries[0][1][1]).reason, 'WORKER_INTERRUPTED');
});
test('timed-out child is killed before recording HOLD and never automatically replayed', async () => {
  const result = await scenario('timeout');
  assert.deepEqual(result.kills, ['SIGKILL']);
  assert.equal(result.exitCode, 1);
  assert.match(result.queries[0][0], /status='HOLD'/);
  assert.doesNotMatch(result.queries.map(x => x[0]).join(''), /status='QUEUED'/);
});
