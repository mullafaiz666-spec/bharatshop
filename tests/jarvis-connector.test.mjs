import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { createJarvis } from '../scripts/jarvis/server.mjs';

test('Jarvis requires pairing and dispatches a status task to the BharatShop worker', async () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('BharatShop worker status OK'));
      child.emit('close', 0);
    });
    return child;
  };
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const app = createJarvis({ root: process.cwd(), token: 'test-token', port, run, getModels: async () => ['deepseek-coder-v2:16b'] });
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${port}`;
  const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/health`)).status, 401);
    const health = await (await fetch(`${base}/api/health`, { headers })).json();
    assert.equal(health.workerPresent, true);
    const response = await fetch(`${base}/api/jobs`, { method: 'POST', headers, body: JSON.stringify({ text: '/status' }) });
    assert.equal(response.status, 202);
    const job = await response.json();
    await new Promise(resolve => setImmediate(resolve));
    const jobs = await (await fetch(`${base}/api/jobs`, { headers })).json();
    assert.equal(jobs.jobs.find(item => item.id === job.id).status, 'worker_finished');
    assert.match(jobs.jobs[0].output, /worker status OK/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(-1), ['status']);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
  }
});
