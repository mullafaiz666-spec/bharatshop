import http from "node:http";

const listenHost = process.env.AI_GATEWAY_HOST || "127.0.0.1";
const listenPort = Number(process.env.AI_GATEWAY_PORT || 8787);
const upstream = (process.env.LLAMA_SERVER_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const token = (process.env.AI_GATEWAY_TOKEN || "").trim();

if (!token || token.length < 32) {
  console.error("AI_GATEWAY_TOKEN is required and must be at least 32 characters");
  process.exit(1);
}

const allowedPaths = new Set(["/v1/models", "/v1/chat/completions"]);

function authorized(req) {
  const header = String(req.headers.authorization || "");
  return header === `Bearer ${token}`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 20 * 1024 * 1024) throw new Error("request body too large");
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!authorized(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "Unauthorized" } }));
    }

    const path = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
    if (req.method === "GET" && path === "/v1/models") {
      const upstreamResponse = await fetch(`${upstream}/v1/models`, { headers: { accept: "application/json" } });
      const text = await upstreamResponse.text();
      res.writeHead(upstreamResponse.status, { "content-type": upstreamResponse.headers.get("content-type") || "application/json" });
      return res.end(text);
    }

    if (req.method !== "POST" || !allowedPaths.has(path)) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "Not found" } }));
    }

    const body = await readBody(req);
    const upstreamResponse = await fetch(`${upstream}${path}`, {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] || "application/json" },
      body,
    });

    res.writeHead(upstreamResponse.status, {
      "content-type": upstreamResponse.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });

    if (upstreamResponse.body) {
      const reader = upstreamResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } else {
      res.end(await upstreamResponse.text());
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }));
  }
});

server.listen(listenPort, listenHost, () => {
  console.log(`BharatShop local AI gateway listening on http://${listenHost}:${listenPort}`);
  console.log(`Upstream llama.cpp server: ${upstream}`);
  console.log("Exposes only /v1/models and /v1/chat/completions; bearer authentication required.");
});
