import http from "node:http";

const HOST = process.env.OLLAMA_SHIM_HOST || "127.0.0.1";
const PORT = Number(process.env.OLLAMA_SHIM_PORT || 11555);
const UPSTREAM = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const BODY_LIMIT = 2_000_000;

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function proxy(req, res, url) {
  const raw = req.method === "GET" || req.method === "HEAD" ? "" : await readBody(req);
  let body = raw;

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    const parsed = raw ? JSON.parse(raw) : {};
    const model = String(parsed.model || "");
    if (/^qwen/i.test(model) && parsed.think === undefined) parsed.think = false;
    body = JSON.stringify(parsed);
  }

  const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
    method: req.method,
    headers: {
      "content-type": req.headers["content-type"] || "application/json",
      "accept": req.headers.accept || "application/json",
    },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    signal: AbortSignal.timeout(180_000),
  });

  const bytes = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "content-length": bytes.length,
    "cache-control": "no-store",
  });
  res.end(bytes);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === "GET" && url.pathname === "/health") {
      try {
        const probe = await fetch(`${UPSTREAM}/api/tags`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
        if (!probe.ok) return sendJson(res, 503, { ok: false, upstream: false, status: probe.status });
        const data = await probe.json().catch(() => ({}));
        return sendJson(res, 200, {
          ok: true,
          upstream: true,
          models: Array.isArray(data?.models) ? data.models.map((item) => item?.name).filter(Boolean) : [],
        });
      } catch (error) {
        return sendJson(res, 503, { ok: false, upstream: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if ((req.method === "GET" && url.pathname === "/v1/models") || (req.method === "POST" && url.pathname === "/v1/chat/completions")) {
      return await proxy(req, res, url);
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return sendJson(res, message === "request_too_large" ? 413 : 500, { error: message.slice(0, 500) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BharatShop Ollama Qwen shim listening on http://${HOST}:${PORT}`);
});
