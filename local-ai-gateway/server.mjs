import express from "express";

const app = express();
const port = Number(process.env.PORT || 8090);
const upstream = (process.env.UPSTREAM_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const apiKey = process.env.GATEWAY_API_KEY || "";

app.disable("x-powered-by");
app.use(express.json({ limit: "25mb" }));

function authorized(req) {
  if (!apiKey) return true;
  const value = req.headers.authorization || "";
  return value === `Bearer ${apiKey}`;
}

app.get("/health", async (_req, res) => {
  try {
    const r = await fetch(`${upstream}/health`, { signal: AbortSignal.timeout(5000) });
    res.status(r.ok ? 200 : 503).json({ ok: r.ok, gateway: "ready", upstream: r.ok ? "ready" : "unready" });
  } catch (error) {
    res.status(503).json({ ok: false, gateway: "ready", upstream: "unready", error: String(error) });
  }
});

app.get("/v1/models", async (req, res) => proxy(req, res));
app.post("/v1/chat/completions", async (req, res) => proxy(req, res));
app.post("/v1/completions", async (req, res) => proxy(req, res));

async function proxy(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: { message: "Unauthorized", type: "authentication_error" } });
  const target = `${upstream}${req.path}`;
  try {
    const headers = { "content-type": req.headers["content-type"] || "application/json" };
    const body = req.method === "GET" ? undefined : JSON.stringify(req.body);
    const r = await fetch(target, { method: req.method, headers, body, signal: AbortSignal.timeout(120000) });
    res.status(r.status);
    const contentType = r.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    if (req.body?.stream) {
      const reader = r.body?.getReader();
      if (!reader) return res.end();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ error: { message: "Local AI upstream unavailable", type: "upstream_error", detail: String(error) } });
  }
}

app.listen(port, "0.0.0.0", () => console.log(`BharatShop local AI gateway listening on :${port}; upstream=${upstream}`));
