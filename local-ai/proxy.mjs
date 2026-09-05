import http from 'node:http';

const port = Number(process.env.PORT || 10000);
const upstream = process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434';

const server = http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/v1/models') {
    try {
      const r = await fetch(`${upstream}${req.url === '/health' ? '/api/tags' : '/v1/models'}`);
      const body = await r.text();
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
      res.end(body);
    } catch (e) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.url === '/chat/completions' || req.url === '/v1/chat/completions') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      const r = await fetch(`${upstream}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: Buffer.concat(chunks)
      });
      const body = await r.text();
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
      res.end(body);
    } catch (e) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => console.log(`local AI proxy listening on ${port}`));
