import http from 'node:http';

const port = Number(process.env.PORT || 10000);
const localUpstream = process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434';
const model = process.env.GEMMA_MODEL || 'gemma3:270m-it-qat';

function backend() {
  if (process.env.OLLAMA_UPSTREAM || process.env.USE_LOCAL_OLLAMA === '1') return 'ollama';
  return 'unconfigured';
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function requestPath(req) {
  try { return new URL(req.url || '/', 'http://localhost').pathname; }
  catch { return req.url || '/'; }
}

function upstreamPath(path) {
  if (path === '/health' || path === '/models' || path === '/v1/models') return '/api/tags';
  if (path === '/chat/completions' || path === '/v1/chat/completions') return '/api/chat';
  return path;
}

function toOllamaPayload(body) {
  const json = JSON.parse(body.toString('utf8'));
  const messages = Array.isArray(json.messages) ? json.messages.map((message) => {
    if (!Array.isArray(message?.content)) return message;
    const text = message.content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
    return { ...message, content: text };
  }) : [];
  const requestedTokens = Number(json.max_tokens ?? json.max_completion_tokens ?? 256);
  const numPredict = Number.isFinite(requestedTokens) ? Math.max(1, Math.min(1024, Math.floor(requestedTokens))) : 256;
  return Buffer.from(JSON.stringify({
    model,
    messages,
    stream: false,
    ...(Array.isArray(json.tools) && json.tools.length ? { tools: json.tools } : {}),
    options: {
      temperature: Number(json.temperature ?? 0.2),
      num_ctx: Number(process.env.OLLAMA_CONTEXT_LENGTH || 1024),
      num_predict: numPredict,
    },
  }));
}

function normalizeToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map((call, index) => {
    const fn = call?.function || {};
    const rawArgs = fn.arguments ?? {};
    const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
    return {
      id: String(call?.id || `call_${Date.now()}_${index}`),
      type: 'function',
      function: { name: String(fn.name || ''), arguments: args },
    };
  }).filter((call) => call.function.name);
}

function fromOllamaChat(text) {
  const json = JSON.parse(text);
  const content = String(json?.message?.content || '').trim();
  const toolCalls = normalizeToolCalls(json?.message?.tool_calls);
  const message = { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  return JSON.stringify({
    id: `local-${Date.now()}`,
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }],
  });
}

async function verifyGemma() {
  const result = { backend: backend(), model, text: null, vision: { pass: false, disabled: true, reason: 'Gemma multimodal requires 4B+ and does not fit the 512 MB free tier' }, ok: false };
  if (result.backend === 'unconfigured') return result;
  try {
    const r = await fetch(`${localUpstream}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly GEMMA_TEXT_OK' }], stream: false, options: { temperature: 0, num_ctx: 512, num_predict: 8 } }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    const answer = String(json?.message?.content || '').trim();
    result.text = { pass: answer.length > 0, response: answer.slice(0, 200) };
    result.ok = Boolean(result.text.pass);
  } catch (e) {
    result.text = { pass: false, error: String(e).slice(0, 500) };
  }
  return result;
}

async function proxy(req, res) {
  if (backend() === 'unconfigured') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Gemma gateway is not configured', type: 'configuration_error' } }));
    return;
  }
  const path = requestPath(req);
  const raw = await readBody(req);
  const targetPath = upstreamPath(path);
  let payload = raw;
  const isChat = path === '/chat/completions' || path === '/v1/chat/completions';
  try {
    if (isChat && raw.length) payload = toOllamaPayload(raw);
    const r = await fetch(`${localUpstream}${targetPath}`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : payload,
      signal: AbortSignal.timeout(120000),
    });
    const text = await r.text();
    if (isChat && r.ok) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(fromOllamaChat(text));
      return;
    }
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    res.end(text);
  } catch (e) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: String(e), type: 'upstream_unavailable' } }));
  }
}

const server = http.createServer(async (req, res) => {
  const path = requestPath(req);
  if (path === '/verify') {
    const result = await verifyGemma();
    res.writeHead(result.ok ? 200 : 502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(result));
    return;
  }
  if (path === '/health' || path === '/models' || path === '/v1/models' || path === '/api/chat' || path === '/chat/completions' || path === '/v1/chat/completions') return proxy(req, res);
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Gemma gateway listening on ${port}; backend=${backend()}; model=${model}`);
  if (process.env.GEMMA_SMOKE_TEST === '1') verifyGemma().then(result => console.log(`GEMMA_SMOKE_TEST result=${JSON.stringify(result)}`)).catch(e => console.error(`GEMMA_SMOKE_TEST fatal=${String(e)}`));
});
