import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT || 10000);
const upstream = (process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const key = process.env.AI_GATEWAY_API_KEY || '';
const paths = new Map([
  ['/models', '/v1/models'], ['/v1/models', '/v1/models'],
  ['/chat/completions', '/v1/chat/completions'], ['/v1/chat/completions', '/v1/chat/completions'],
]);
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
function authorized(req) {
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${key}`);
  return key.length >= 32 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8_000_000) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  // Liveness is separate from readiness and never triggers inference.
  if (path === '/health' && req.method === 'GET') return send(res, 200, { status: 'alive', ready: false, inferenceVerified: false });
  if (!key || key.length < 32) return send(res, 503, { error: { message: 'Configure AI_GATEWAY_API_KEY with at least 32 characters' } });
  if (!authorized(req)) return send(res, 401, { error: { message: 'Unauthorized' } });
  const target = paths.get(path);
  if (!target) return send(res, 404, { error: { message: 'Not found' } });
  const isChat = target.endsWith('/chat/completions');
  if (req.method !== (isChat ? 'POST' : 'GET')) return send(res, 405, { error: { message: 'Method not allowed' } });
  try {
    let body;
    if (isChat) {
      const raw = await readBody(req);
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: { message: 'Invalid JSON' } }); }
      if (!Array.isArray(payload.messages) || !payload.messages.length || typeof payload.model !== 'string') return send(res, 400, { error: { message: 'model and messages are required' } });
      if (payload.stream === true) return send(res, 400, { error: { message: 'Streaming is not supported by this gateway' } });
      // Preserve requested model, image_url parts, tools, tool messages and token limits.
      const requested = Number(payload.max_tokens ?? payload.max_completion_tokens ?? 256);
      if (!Number.isFinite(requested) || requested < 1) return send(res, 400, { error: { message: "Invalid token limit" } });
      body = JSON.stringify({ ...payload, max_tokens: Math.min(1024, Math.floor(requested)), stream: false });
    }
    const response = await fetch(`${upstream}${target}`, {
      method: req.method, headers: { 'content-type': 'application/json' }, body,
      signal: AbortSignal.timeout(120000),
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { return send(res, 502, { error: { message: 'Upstream returned invalid JSON' } }); }
    if (!response.ok) return send(res, response.status, { error: { message: `Local model request failed (HTTP ${response.status})` } });
    if (isChat && (!data.choices?.[0]?.message || data.error)) return send(res, 502, { error: { message: 'Upstream returned no assistant message' } });
    return send(res, 200, data);
  } catch (error) {
    return send(res, error.message === 'BODY_TOO_LARGE' ? 413 : 503, { error: { message: error.message === 'BODY_TOO_LARGE' ? 'Request body too large' : 'Local model upstream unavailable' } });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Local AI gateway listening on ${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
