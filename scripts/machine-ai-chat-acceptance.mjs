#!/usr/bin/env node

const base = String(process.env.BHARATSHOP_MACHINE_UI_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');

async function chat(content, signal) {
  const started = Date.now();
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ mode: 'chat', messages: [{ role: 'user', content }] }),
    signal,
  });
  const text = await response.text();
  const events = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  return { status: response.status, elapsedMs: Date.now() - started, events };
}

function answer(result) {
  return result.events.filter(event => event.type === 'delta').map(event => event.text || '').join('');
}

const first = await chat('Reply with exactly MACHINE_AI_FIRST_OK', AbortSignal.timeout(120_000));
if (first.status !== 200 || !first.events.some(event => event.type === 'done') || !answer(first).includes('MACHINE_AI_FIRST_OK')) {
  throw new Error('First real Machine AI reply did not complete as expected.');
}

const cancellation = new AbortController();
const cancelTimer = setTimeout(() => cancellation.abort(), 1_500);
let cancelled = false;
const cancelStarted = Date.now();
try {
  await chat('Write a very long detailed essay with at least fifty sections about software architecture.', cancellation.signal);
} catch (error) {
  cancelled = error?.name === 'AbortError';
} finally {
  clearTimeout(cancelTimer);
}
if (!cancelled) throw new Error('Cancellation did not abort the client request.');
const cancellationMs = Date.now() - cancelStarted;

await new Promise(resolve => setTimeout(resolve, 500));
const second = await chat('Reply with exactly MACHINE_AI_AFTER_CANCEL_OK', AbortSignal.timeout(120_000));
if (second.status !== 200 || !second.events.some(event => event.type === 'done') || !answer(second).includes('MACHINE_AI_AFTER_CANCEL_OK')) {
  throw new Error('Machine AI did not recover after cancellation.');
}

console.log(JSON.stringify({
  ok: true,
  firstReplyMs: first.elapsedMs,
  cancellationMs,
  subsequentReplyMs: second.elapsedMs,
}));
