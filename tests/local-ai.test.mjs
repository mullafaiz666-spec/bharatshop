import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { runText, verifyImagesWithAI, checkAI } from '../src/lib/ai/provider.ts';

async function upstream(handler) {
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    handler(req, res, chunks.length ? JSON.parse(Buffer.concat(chunks)) : null);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const completion = content => ({ choices: [{ message: { role: 'assistant', content } }] });

test('provider normalizes /v1, sends pixel bytes and rejects invalid confidence', async t => {
  let request; let verdict = { matches: true, confidence: 0.9, reason: 'Visible matching product' };
  const u = await upstream((req, res, body) => { request = { path: req.url, body }; res.end(JSON.stringify(completion(JSON.stringify(verdict)))); });
  t.after(() => u.server.close()); process.env.AI_BASE_URL = `${u.url}/v1/`;
  const result = await verifyImagesWithAI({ title: 'Example product', brand: 'Example' }, [{ data: 'aW1hZ2U=', mediaType: 'image/png' }]);
  assert.equal(request.path, '/v1/chat/completions');
  assert.equal(request.body.messages[0].content[1].image_url.url, 'data:image/png;base64,aW1hZ2U=');
  assert.equal(result[0].confidence, 0.9);
  verdict.confidence = 7;
  await assert.rejects(() => verifyImagesWithAI({ title: 'X', brand: 'Y' }, [{ data: 'aA==', mediaType: 'image/png' }]), /Invalid vision/);
});

test('Gemma planner preserves tool results and rejects unauthorized calls', async t => {
  let plan = { reply: '', tool_calls: [{ name: 'inspect', arguments: {} }] }; let sent;
  const u = await upstream((req, res, body) => { sent = body; res.end(JSON.stringify(completion(JSON.stringify(plan)))); });
  t.after(() => u.server.close()); process.env.AI_BASE_URL = u.url;
  const options = { model: 'gemma3:4b', tools: [{ type: 'function', function: { name: 'inspect' } }] };
  const result = await runText([{ role: 'tool', tool_call_id: 'prior', content: '{"realCount":3}' }], options);
  assert.equal(result.toolCalls[0].function.name, 'inspect');
  assert.match(sent.messages[1].content, /realCount/);
  assert.equal(sent.tools, undefined);
  plan = { reply: '', tool_calls: [{ name: 'purchase_without_approval', arguments: {} }] };
  await assert.rejects(() => runText([{ role: 'user', content: 'test' }], options), /unauthorized tool/);
});

test('model listing and empty output cannot pass inference readiness', async t => {
  const u = await upstream((req, res) => res.end(JSON.stringify(req.url.endsWith('/models') ? { data: [{ id: 'gemma3:4b' }] } : completion(''))));
  t.after(() => u.server.close()); process.env.AI_BASE_URL = u.url;
  assert.equal((await checkAI(false)).ready, false);
  assert.equal((await checkAI(true)).ready, false);
  await assert.rejects(() => runText([{ role: 'user', content: 'test' }]), /empty response/);
});

test('media policy rejects keyword evidence, wrong model, invalid confidence and weak threshold', async () => {
  const source = (await readFile(new URL('../src/lib/ai/media-policy.ts', import.meta.url), 'utf8')).replace("'./provider'", JSON.stringify(new URL('../src/lib/ai/provider.ts', import.meta.url).href));
  // Node's TS stripping operates on files; write a temporary module outside the repository.
  const { stripTypeScriptTypes } = await import('node:module');
  const { isVerifiedMedia } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  process.env.IMAGE_VERIFY_MIN_CONFIDENCE = '0.1';
  const row = { imageUrl: 'https://example.com/real.png', verificationStatus: 'AI_VISION_VERIFIED', verificationProvider: 'local-ai', verificationModel: 'gemma3:4b', verificationConfidence: 0.9, verifiedAt: new Date() };
  assert.equal(isVerifiedMedia(row), true);
  for (const change of [{ verificationStatus: 'LOCAL_EVIDENCE_VERIFIED' }, { verificationConfidence: 0.5 }, { verificationConfidence: 'NaN' }, { verificationModel: 'local-evidence-v1' }, { imageUrl: 'https://picsum.photos/200' }]) assert.equal(isVerifiedMedia({ ...row, ...change }), false);
  delete process.env.IMAGE_VERIFY_MIN_CONFIDENCE;
});

test('gateway enforces authentication and forwards images, model and tool calls unchanged', async t => {
  let captured;
  const u = await upstream((req, res, body) => { captured = { path: req.url, body }; res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 't1', type: 'function', function: { name: 'inspect', arguments: '{}' } }] } }] })); });
  t.after(() => u.server.close());
  const key = 'test-only-key-with-at-least-32-characters';
  const child = spawn(process.execPath, ['local-ai/proxy.mjs'], { env: { ...process.env, PORT: '19283', OLLAMA_UPSTREAM: u.url, AI_GATEWAY_API_KEY: key }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill()); await once(child.stdout, 'data');
  const base = 'http://127.0.0.1:19283';
  assert.equal((await fetch(`${base}/v1/models`)).status, 401);
  const body = { model: 'gemma3:4b', max_tokens: 321, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aA==' } }] }], tools: [{ type: 'function', function: { name: 'inspect' } }] };
  const response = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); assert.equal((await response.json()).choices[0].message.tool_calls[0].id, 't1');
  assert.deepEqual(captured.body, { ...body, stream: false }); assert.equal(captured.path, '/v1/chat/completions');
  assert.equal((await fetch(`${base}/v1/chat/completions`, { headers: { authorization: `Bearer ${key}` } })).status, 405);
});

test('tool validation rejects missing, invalid and extra arguments before execution', async () => {
  const { validateToolInput } = await import('../src/lib/ai/tool-validation.ts');
  const schema = { type: 'object', required: ['product_id', 'risk'], properties: { product_id: { type: 'integer' }, risk: { type: 'string', enum: ['LOW', 'HIGH'] } }, additionalProperties: false };
  assert.doesNotThrow(() => validateToolInput(schema, { product_id: 5, risk: 'LOW' }));
  for (const input of [{ risk: 'LOW' }, { product_id: -1, risk: 'LOW' }, { product_id: 5, risk: 'NONE' }, { product_id: 5, risk: 'LOW', bypass: true }]) assert.throws(() => validateToolInput(schema, input));
});
