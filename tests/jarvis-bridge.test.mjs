import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import { classify, commandFor, createJarvis, SITE, redact } from '../scripts/jarvis/server.mjs';

test('routes operational requests without inventing execution', () => {
  assert.equal(classify('Jarvis fix checkout').route, 'build');
  assert.equal(classify('verify BharatShop build').route, 'verify');
  assert.equal(classify('/browser inspect the storefront').route, 'browser');
  assert.equal(classify('run the employees').route, 'company');
  assert.equal(classify('hello').route, 'chat');
  assert.equal(classify('कार्ट ठीक करो').route, 'build');
  assert.equal(classify('भारतशॉप की जाँच करो').route, 'verify');
  assert.throws(() => classify('hello', 'shell'));
  assert.throws(() => commandFor('/tmp', 'build', '--execute'));
  const text = 'fix cart; echo $(anything)';
  assert.equal(commandFor('/tmp', 'build', text)[1][2], text);
  assert.equal(redact('postgres://user:password@host/db'), 'postgres://[redacted]');
});

test('authenticated HTTP to real worker, lifecycle, origin checks, company approval and cancellation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {} }));
  writeFileSync(join(root, 'scripts/personal-ai.mjs'), `console.log(JSON.stringify(process.argv.slice(2))); console.log(process.env.PERSONAL_AI_MODEL); if(process.argv.includes('wait')) setInterval(()=>{},1000); else setTimeout(()=>process.exit(process.argv.includes('fail')?1:0),100);`);
  const port = 31387;
  const app = createJarvis({ root, token: 'test-session-only', port, getModels: async () => ['deepseek-coder-v2:16b', 'test-local-model'] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  const request = (path, body, headers = {}) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-session-only', Origin: SITE, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && JSON.stringify(body) });
  const waitJob = async (id, wanted) => {
    for (let i = 0; i < 160; i++) {
      const { jobs } = await (await request('/api/jobs')).json(); const job = jobs.find(j => j.id === id);
      if (wanted.includes(job?.status)) return job;
      await new Promise(r => setTimeout(r, 30));
    }
    throw new Error('Worker did not reach terminal status');
  };
  try {
    assert.equal((await fetch(base + '/api/jobs')).status, 401);
    assert.equal((await request('/api/jobs', null, { Origin: 'https://evil.example' })).status, 403);
    const badHost = await new Promise(resolve => { http.get(base + '/api/jobs', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }); });
    assert.equal(badHost, 403);
    const preflight = await fetch(base + '/api/jobs', { method: 'OPTIONS', headers: { Origin: SITE } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), SITE);
    assert.equal((await request('/api/jobs', { text: '/company' })).status, 409);
    assert.equal((await request('/api/jobs', { text: '--execute', mode: 'build' })).status, 400);
    const health = await (await request('/api/health')).json();
    assert.equal(health.version, '2.0.0'); assert.equal(health.models.length, 2);
    assert.equal(health.model, 'deepseek-coder-v2:16b'); assert.equal(health.modelInstalled, true);
    assert.ok(health.machine.totalMemoryGB > 0);
    const plan = await (await request('/api/preview', { text: 'fix cart', verifyAfter: true })).json();
    assert.deepEqual(plan.stages, ['build', 'typecheck', 'build-check']); assert.equal(plan.executed, false);
    assert.equal((await (await request('/api/jobs')).json()).jobs.length, 0);
    assert.equal((await request('/api/jobs', { text: 'hello', model: 'not-installed' })).status, 400);
    const job = await (await request('/api/jobs', { text: 'literal ; $(echo surprise)', mode: 'build' })).json();
    const finished = await waitJob(job.id, ['worker_finished']);
    assert.match(finished.output, /literal ; \$\(echo surprise\)/);
    assert.match(finished.output, /--execute/);
    assert.equal(finished.exitCode, 0);
    const greeting = await (await request('/api/jobs', { text: 'hello', mode: 'chat' })).json();
    assert.equal((await waitJob(greeting.id, ['worker_finished'])).exitCode, 0);
    const failing = await (await request('/api/jobs', { text: 'fail', mode: 'build' })).json();
    assert.equal((await waitJob(failing.id, ['failed'])).exitCode, 1);
    const followup = await (await request('/api/jobs', { text: 'proceed', mode: 'chat' })).json();
    const followed = await waitJob(followup.id, ['worker_finished']);
    assert.match(followed.output, /User: hello/);
    assert.match(followed.output, /User: proceed/);
    assert.equal(followed.task, 'proceed');
    assert.equal('workerTask' in followed, false);
    const waiting = await (await request('/api/jobs', { text: 'wait', mode: 'chat' })).json();
    assert.equal((await request('/api/jobs', { text: 'second' })).status, 409);
    assert.equal((await request('/api/stop', { id: waiting.id })).status, 200);
    assert.equal((await waitJob(waiting.id, ['cancelled'])).status, 'cancelled');
    await new Promise(r => setTimeout(r, 150));
    const verify = await (await request('/api/jobs', { text: '/verify' })).json();
    assert.equal(verify.status, 'failed'); assert.match(verify.output, /no typecheck script/);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node check.mjs', build: 'node build.mjs' } }));
    writeFileSync(join(root, 'check.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync('checked','yes');`);
    writeFileSync(join(root, 'build.mjs'), `import {readFileSync,writeFileSync} from 'node:fs'; if(readFileSync('checked','utf8') !== 'yes') process.exit(1); writeFileSync('built','yes');`);
    const verified = await (await request('/api/jobs', { text: '/verify' })).json();
    assert.equal((await waitJob(verified.id, ['worker_finished'])).exitCode, 0);
    assert.equal(readFileSync(join(root, 'built'), 'utf8'), 'yes');
    const pipeline = await (await request('/api/jobs', { text: 'fix cart', mode: 'build', verifyAfter: true, model: 'test-local-model', requestId: 'pipeline-test' })).json();
    const duplicate = await (await request('/api/jobs', { text: 'fix cart', mode: 'build', verifyAfter: true, model: 'test-local-model', requestId: 'pipeline-test' })).json();
    assert.equal(duplicate.id, pipeline.id);
    const done = await waitJob(pipeline.id, ['worker_finished']);
    assert.deepEqual(done.stages.map(s => s.status), ['passed', 'passed', 'passed']);
    assert.equal(done.checksStatus, 'passed'); assert.match(done.output, /test-local-model/);
    writeFileSync(join(root, 'check.mjs'), 'process.exit(9)');
    const broken = await (await request('/api/jobs', { text: 'fix cart', mode: 'build', verifyAfter: true })).json();
    const stopped = await waitJob(broken.id, ['failed']);
    assert.equal(stopped.stages[1].exitCode, 9); assert.equal(stopped.stages[2].status, 'pending');
    assert.equal(stopped.checksStatus, 'incomplete_or_failed');

  } finally { app.close(); await once(app.server, 'close'); rmSync(root, { recursive: true, force: true }); }
});
