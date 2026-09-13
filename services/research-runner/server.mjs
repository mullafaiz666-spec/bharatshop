import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import { CheerioCrawler, Configuration } from "crawlee";

const PORT = Number(process.env.RESEARCH_RUNNER_PORT || 8207);
const HOST = process.env.RESEARCH_RUNNER_HOST || "127.0.0.1";
const TOKEN = String(process.env.RESEARCH_RUNNER_TOKEN || "");

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
};

const authorized = (req) => !TOKEN || req.headers.authorization === `Bearer ${TOKEN}`;

const readJson = async (req, limit = 250_000) => {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIP(ip) === 6) {
    const x = ip.toLowerCase();
    return x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80:");
  }
  return true;
}

async function assertPublicHttpUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!/^https?:$/.test(url.protocol)) throw new Error("only_http_https_urls_are_allowed");
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) throw new Error("private_targets_are_blocked");
  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) throw new Error("private_targets_are_blocked");
  return url;
}

function compactText(value, max = 12_000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, service: "bharatshop-crawlee-research-runner" });
    }
    if (req.method !== "POST" || url.pathname !== "/crawl") return json(res, 404, { error: "not_found" });
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

    const body = await readJson(req);
    const startUrl = await assertPublicHttpUrl(body.url);
    const maxPages = Math.max(1, Math.min(20, Number(body.maxPages || 5)));
    const sameOrigin = body.sameOrigin !== false;
    const results = [];

    const config = new Configuration({ persistStorage: false });
    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: maxPages,
      maxConcurrency: 2,
      requestHandlerTimeoutSecs: 45,
      async requestHandler({ request, $, enqueueLinks }) {
        const current = await assertPublicHttpUrl(request.url);
        const description = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
        const title = $("title").first().text();
        const headings = $("h1,h2,h3").map((_, el) => compactText($(el).text(), 500)).get().filter(Boolean).slice(0, 40);
        const bodyText = compactText($("body").text());
        const links = $("a[href]").map((_, el) => {
          try { return new URL($(el).attr("href"), current).toString(); } catch { return null; }
        }).get().filter(Boolean).slice(0, 100);
        results.push({ url: current.toString(), title: compactText(title, 500), description: compactText(description, 1000), headings, text: bodyText, links });
        if (results.length < maxPages) {
          await enqueueLinks({ strategy: sameOrigin ? "same-origin" : "all", limit: Math.max(0, maxPages - results.length) });
        }
      },
      failedRequestHandler({ request, error }) {
        results.push({ url: request.url, error: String(error?.message || error).slice(0, 500) });
      },
    }, config);

    await crawler.run([startUrl.toString()]);
    return json(res, 200, { ok: true, startUrl: startUrl.toString(), pages: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "request_too_large" ? 413 : /blocked|allowed|url/i.test(message) ? 400 : 500;
    return json(res, status, { error: message.slice(0, 500) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BharatShop Crawlee research runner listening on http://${HOST}:${PORT}`);
});
