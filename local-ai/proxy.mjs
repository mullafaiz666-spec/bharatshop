import http from 'node:http';

const port = Number(process.env.PORT || 10000);
const localUpstream = process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434';
const openRouterBase = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const openRouterKey = process.env.OPENROUTER_API_KEY || '';
const model = process.env.GEMMA_MODEL || 'google/gemma-3-4b-it:free';

function backend() {
  if (openRouterKey) return 'openrouter';
  if (process.env.OLLAMA_UPSTREAM || process.env.USE_LOCAL_OLLAMA === '1') return 'ollama';
  return 'unconfigured';
}

function headersFor(target) {
  if (target === 'openrouter') {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${openRouterKey}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://bharatshop-9w4a.onrender.com',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'BharatShop'
    };
  }
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

async function callGemma(messages) {
  const target = backend();
  if (target === 'unconfigured') throw new Error('Gemma gateway is not configured');
  const base = target === 'openrouter' ? openRouterBase : localUpstream;
  const path = target === 'openrouter' ? '/chat/completions' : '/api/chat';
  const payload = target === 'openrouter'
    ? { model, messages, temperature: 0, max_tokens: 80 }
    : { model, messages, stream: false };
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: headersFor(target),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 500)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`non-JSON response: ${text.slice(0, 300)}`); }
  const answer = target === 'openrouter'
    ? json?.choices?.[0]?.message?.content
    : json?.message?.content || json?.response;
  if (!answer || typeof answer !== 'string') throw new Error(`missing model content: ${text.slice(0, 500)}`);
  return answer.replace(/\s+/g, ' ').trim();
}

async function runSmokeTests() {
  if (process.env.GEMMA_SMOKE_TEST !== '1') return;
  console.log(`GEMMA_SMOKE_TEST start; backend=${backend()}; model=${model}`);
  try {
    const text = await callGemma([{ role: 'user', content: 'Reply with exactly: GEMMA_TEXT_OK' }]);
    console.log(`GEMMA_TEXT_PROOF PASS; response=${JSON.stringify(text.slice(0, 200))}`);
  } catch (e) {
    console.error(`GEMMA_TEXT_PROOF FAIL; error=${String(e).slice(0, 500)}`);
  }

  try {
    const vision = await callGemma([{
      role: 'user',
      content: [
        { type: 'text', text: 'Identify the main subject in this image in one short phrase.' },
        { type: 'image_url', image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/320px-Fronalpstock_big.jpg' } }
      ]
    }]);
    console.log(`GEMMA_VISION_PROOF PASS; response=${JSON.stringify(vision.slice(0, 200))}`);
  } catch (e) {
    console.error(`GEMMA_VISION_PROOF FAIL; error=${String(e).slice(0, 500)}`);
  }
  console.log('GEMMA_SMOKE_TEST end');
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

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/models' || req.url === '/v1/models' || req.url === '/chat/completions' || req.url === '/v1/chat/completions') {
    return proxy(req, res);
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Gemma gateway listening on ${port}; backend=${backend()}; model=${model}`);
  runSmokeTests().catch((e) => console.error(`GEMMA_SMOKE_TEST fatal: ${String(e).slice(0, 500)}`));
});
