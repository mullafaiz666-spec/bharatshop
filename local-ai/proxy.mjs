import http from 'node:http';

const port = Number(process.env.PORT || 10000);
const localUpstream = process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434';
const openRouterBase = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const openRouterKey = process.env.OPENROUTER_API_KEY || '';
const model = process.env.GEMMA_MODEL || 'gemma3:4b';

function backend() {
  if (openRouterKey) return 'openrouter';
  if (process.env.OLLAMA_UPSTREAM || process.env.USE_LOCAL_OLLAMA === '1') return 'ollama';
  return 'unconfigured';
}

function headersFor(target) {
  if (target === 'openrouter') return {
    'content-type': 'application/json',
    authorization: `Bearer ${openRouterKey}`,
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://bharatshop-9w4a.onrender.com',
    'X-Title': process.env.OPENROUTER_APP_NAME || 'BharatShop'
  };
  return { 'content-type': 'application/json' };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function upstreamPathFor(target, path) {
  if (path === '/health') return target === 'openrouter' ? '/models' : '/api/tags';
  if (target !== 'openrouter') return path;
  if (path === '/models' || path === '/v1/models') return '/models';
  if (path === '/chat/completions' || path === '/v1/chat/completions') return '/chat/completions';
  return path.startsWith('/v1/') ? path.slice(3) : path;
}

function ollamaMessages(messages) {
  return messages.map((message) => {
    if (!Array.isArray(message?.content)) return message;
    const text = message.content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
    const images = message.content
      .filter((part) => part?.type === 'image_url' && typeof part.image_url?.url === 'string')
      .map((part) => part.image_url.url.replace(/^data:[^;]+;base64,/, ''));
    return { role: message.role, content: text, ...(images.length ? { images } : {}) };
  });
}

async function callGemma(messages) {
  const target = backend();
  if (target === 'unconfigured') throw new Error('Gemma gateway is not configured');
  const base = target === 'openrouter' ? openRouterBase : localUpstream;
  const path = target === 'openrouter' ? '/chat/completions' : '/api/chat';
  const payload = target === 'openrouter'
    ? { model, messages, temperature: 0, max_tokens: 80 }
    : { model, messages: ollamaMessages(messages), stream: false, options: { temperature: 0 } };
  const started = Date.now();
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: headersFor(target),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000)
  });
  const text = await r.text();
  const elapsedMs = Date.now() - started;
  if (!r.ok) throw new Error(`HTTP ${r.status} after ${elapsedMs}ms: ${text.slice(0, 500)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`non-JSON response after ${elapsedMs}ms: ${text.slice(0, 300)}`); }
  const answer = target === 'openrouter'
    ? json?.choices?.[0]?.message?.content
    : json?.message?.content || json?.response;
  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    throw new Error(`missing non-empty model content after ${elapsedMs}ms: ${text.slice(0, 500)}`);
  }
  return answer.replace(/\s+/g, ' ').trim();
}

async function callGemmaWithRetry(messages, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try { return await callGemma(messages); }
    catch (e) {
      lastError = e;
      console.error(`GEMMA_REQUEST retry=${i + 1}/${attempts} error=${String(e).slice(0, 500)}`);
      if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

const VISION_SMOKE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAEOElEQVR4nO2cr5bTQBTGs5xVFWCqMQjWYDAYPE8Ab4BYBKYGExUBprYVvEF5A/QazArWrKnBsqaI1YjZM4Rkkvl3Z74k8/1UT047m/P97r2ZtIGzz9e/K4LjEfoESocCwFAAGAoAQwFgKAAMBYChADAUAOYcfQKT5tPj950jX/58lf0TZ/wqok8/9z5SJjiCurik7/42K+yAf4RlGtkK7IAHgis6shUoAAwFVFV0Fcd8nAJkLqfBi1AAGAoAU7oAqe188FKlC4BDAWAoAAwFgClOwMfnK/Qp/EdZAlT6bQeC3++HLVWWAM3psEefwgMFCWgXfl1vgGfSphQB/dGvj4hMoeBFihAwNHCkHMR8vAgBIwMHfjFYvoDxfWddb5SD4CrmT5JjuBR424FXmr7vN7JkAafDPmC345ip1A3EVJ6KOO6aZx9q2TW9bnqbZvvk3WXnYCkPZh13jXoh6CCg/I0OUoMfQTp9QcKGT4XYFIE7oJ++SBMEf+PWNNuqqnL2AbIDjLUf3xAxVZz/Kwr8CJIlePho9K40D7DH00cqPXhH5J6+GjWa/qdOh32eQYS5BrjMmQAHLgI60Rup6022iwFgBKXY9lRy6bfflmEW5e4Ar/Tdm8CavmP0RpL2QdYO8K19x/db6zQm/dTkuwgnmjyKofIXiT7pBTlTBwSnb/3gyPARLPx0F4McAiJrf+TjQ7k0zVZ87CRyMPsbsX75p5v4KRyICdgf3hiPi4x+4yL94ZOi8FMjI0Cl33cgeOHtLNUvxjzRizdBwl1Qum2PSkGXf+aql90UCXRAu/D16xTpt9dEpa8Q7IPYDjCO/nS1f9w16/VavcaOe6k+kN8FDV2NRVDp6y/LsIj0QZSAoay/r69ilh1iIrUvS7iApJU+F+KbIFCANX3xJtDlPzUiHczjTniy6StiHIQIcBw+ia4E0yTYgbcAr9Ev4mDi5R/J1EfQjNIPawI/AQE7n5gmmFH6igAHHgK473TB10GOERTWBLMrf42XA1cBkeXv62C+6SvcHTgJyDx85p6+F3YBUukXdVtQOTfB5LahSyp/FwcWAbLDx9oES0pfYXXg+mii8TeW+5tvxjevXrx1WbPP8gQoRn66cRpBSR9q0yw1/XHsAph+PCODyCKA6Usx5OD8x8/B/2xxffU02fmUyOmwv7247hzEb0NLKH/Nxe3LzpFBAXnKv6j0FR0HZgFMPxsGARz9qWk3QVdAtvQLL3/toPto4t3rX+6rrG7Mx10Wuas8/tCCwe+CCocCwFAAGAoAQwFgKAAMBYChADAUAIYCwFAAGAoAQwFgKABM1L+Uv798JXUexcIOAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsBQABgKAEMBYCgADAWAoQAwFACGAsD8BXq/kNxqrJC3AAAAAElFTkSuQmCC';

async function verifyGemma() {
  const result = { backend: backend(), model, text: null, vision: null, ok: false };
  console.log(`GEMMA_TEXT_REQUEST start; backend=${result.backend}; model=${result.model}`);
  try {
    const text = await callGemmaWithRetry([{ role: 'user', content: 'Reply with exactly: GEMMA_TEXT_OK' }]);
    result.text = { pass: text.includes('GEMMA_TEXT_OK'), response: text.slice(0, 200) };
    console.log(`GEMMA_TEXT_RESPONSE received; non_empty=${Boolean(text)}; response=${JSON.stringify(result.text.response)}`);
  } catch (e) {
    result.text = { pass: false, error: String(e).slice(0, 500) };
    console.error(`GEMMA_TEXT_RESPONSE error=${result.text.error}`);
  }
  console.log(`GEMMA_VISION_REQUEST start; backend=${result.backend}; model=${result.model}`);
  try {
    const vision = await callGemmaWithRetry([{
      role: 'user',
      content: [
        { type: 'text', text: 'Look at this image and describe what you see in one short phrase.' },
        { type: 'image_url', image_url: { url: VISION_SMOKE_IMAGE } }
      ]
    }]);
    result.vision = { pass: Boolean(vision && vision.trim()), response: vision.slice(0, 200) };
    console.log(`GEMMA_VISION_RESPONSE received; non_empty=${Boolean(vision && vision.trim())}; response=${JSON.stringify(result.vision.response)}`);
  } catch (e) {
    result.vision = { pass: false, error: String(e).slice(0, 500) };
    console.error(`GEMMA_VISION_RESPONSE error=${result.vision.error}`);
  }
  result.ok = Boolean(result.text?.pass && result.vision?.pass);
  return result;
}

async function runSmokeTests() {
  if (process.env.GEMMA_SMOKE_TEST !== '1') return;
  console.log(`GEMMA_SMOKE_TEST start; backend=${backend()}; model=${model}`);
  const result = await verifyGemma();
  if (result.text?.pass) console.log(`GEMMA_TEXT_PROOF PASS; response=${JSON.stringify(result.text.response)}`);
  else console.error(`GEMMA_TEXT_PROOF FAIL; error=${result.text?.error || 'response did not contain GEMMA_TEXT_OK'}`);
  if (result.vision?.pass) console.log(`GEMMA_VISION_PROOF PASS; response=${JSON.stringify(result.vision.response)}`);
  else console.error(`GEMMA_VISION_PROOF FAIL; error=${result.vision?.error || 'empty vision response'}`);
  console.log(`GEMMA_SMOKE_TEST result=${JSON.stringify({ ok: result.ok, backend: result.backend, model: result.model })}`);
}

async function proxy(req, res) {
  const target = backend();
  if (target === 'unconfigured') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Gemma gateway is not configured: set OPENROUTER_API_KEY or OLLAMA_UPSTREAM', type: 'configuration_error' } }));
    return;
  }
  const path = req.url || '/';
  const body = await readBody(req);
  let payload = body;
  if ((path === '/chat/completions' || path === '/v1/chat/completions') && target === 'openrouter' && body.length) {
    try {
      const json = JSON.parse(body.toString('utf8'));
      json.model = process.env.GEMMA_MODEL || json.model || model;
      payload = Buffer.from(JSON.stringify(json));
    } catch {}
  }
  const base = target === 'openrouter' ? openRouterBase : localUpstream;
  const upstreamPath = upstreamPathFor(target, path);
  try {
    const r = await fetch(`${base}${upstreamPath}`, {
      method: req.method,
      headers: headersFor(target),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : payload
    });
    const out = await r.text();
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    res.end(out);
  } catch (e) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: String(e), type: 'upstream_unavailable' } }));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/verify') {
    try {
      const result = await verifyGemma();
      res.writeHead(result.ok ? 200 : 502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }
  if (req.url === '/health' || req.url === '/models' || req.url === '/v1/models' || req.url === '/api/chat' || req.url === '/chat/completions' || req.url === '/v1/chat/completions') {
    return proxy(req, res);
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Gemma gateway listening on ${port}; backend=${backend()}; model=${model}`);
  runSmokeTests().catch((e) => console.error(`GEMMA_SMOKE_TEST fatal: ${String(e).slice(0, 500)}`));
});
