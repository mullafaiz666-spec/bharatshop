import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayChat } from '../scripts/jarvis/gateway-chat.mjs';

test('gateway sends the combo and conversation through the OpenAI chat endpoint', async () => {
  let request;
  const result = await gatewayChat('Hello', { baseUrl: 'http://127.0.0.1:20128/v1/', model: 'free-first', key: 'test-only', system: 'Be accurate', fetcher: async (url, options) => {
    request = { url, ...options };
    return { ok: true, json: async () => ({ model: 'actual-model', choices: [{ message: { content: 'Ready' } }] }) };
  } });
  assert.equal(request.url, 'http://127.0.0.1:20128/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer test-only');
  assert.equal(JSON.parse(request.body).model, 'free-first');
  assert.equal(JSON.parse(request.body).messages[0].role, 'system');
  assert.deepEqual(result, { answer: 'Ready', model: 'actual-model' });
});
test('gateway rejects insecure remote URLs before sending credentials', async () => {
  let called = false;
  await assert.rejects(gatewayChat('Hello', { baseUrl: 'http://example.com/v1', model: 'combo', fetcher: async () => { called = true; } }), /HTTPS/);
  assert.equal(called, false);
});
test('gateway HTTP failures omit upstream response bodies and credentials', async () => {
  await assert.rejects(gatewayChat('Hello', { baseUrl: 'https://example.com/v1', model: 'combo', fetcher: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
});
test('gateway rejects empty successful answers', async () => {
  await assert.rejects(gatewayChat('Hello', { baseUrl: 'http://localhost:20128/v1', model: 'combo', fetcher: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), /no text/);
});
