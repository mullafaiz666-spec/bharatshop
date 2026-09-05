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

async function proxy(req, res) {
  const target = backend();
  if (target === 'unconfigured') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Gemma gateway is not configured: set OPENROUTER_API_KEY or OLLAMA_UPSTREAM', type: 'configuration_error' } }));
    return;
  }

  const path = req.url === '/chat/completions' ? '/v1/chat/completions' : req.url;
  const body = await readBody(req);
  let payload = body;
  if (path === '/v1/chat/completions' && target === 'openrouter' && body.length) {
    try {
      const json = JSON.parse(body.toString('utf8'));
      json.model = process.env.GEMMA_MODEL || json.model || model;
      payload = Buffer.from(JSON.stringify(json));
    } catch {
      // Let the upstream return the normal malformed-request error.
    }
  }

  const base = target === 'openrouter' ? openRouterBase : localUpstream;
  const upstreamPath = path === '/health' ? (target === 'openrouter' ? '/models' : '/api/tags') : path;
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
  if (req.url === '/health' || req.url === '/v1/models' || req.url === '/chat/completions' || req.url === '/v1/chat/completions') {
    return proxy(req, res);
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => console.log(`Gemma gateway listening on ${port}; backend=${backend()}; model=${model}`));
