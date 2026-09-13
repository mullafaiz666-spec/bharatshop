import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.env.REMOTION_SERVICE_PORT || 8201);
const token = String(process.env.REMOTION_SERVICE_TOKEN || "").trim();
const renderDir = path.join(here, "renders");
fs.mkdirSync(renderDir, { recursive: true });

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  if (!token) return true;
  const value = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return value === token;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function safeName(value) {
  return String(value || "product-ad")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "product-ad";
}

function renderProductAd(props) {
  return new Promise((resolve, reject) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${safeName(props.title)}-${stamp}.mp4`;
    const output = path.join(renderDir, filename);
    const bin = process.platform === "win32"
      ? path.join(here, "node_modules", ".bin", "remotion.cmd")
      : path.join(here, "node_modules", ".bin", "remotion");
    const args = [
      "render",
      path.join(here, "src", "index.jsx"),
      "ProductAd",
      output,
      "--props",
      JSON.stringify(props),
      "--codec",
      "h264",
      "--overwrite",
    ];
    const child = spawn(bin, args, { cwd: here, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-20000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(output)) resolve({ filename, output });
      else reject(new Error(stderr || `Remotion exited with code ${code}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json(res, 200, {
        ok: true,
        service: "bharatshop-remotion",
        remotionVersion: "4.0.524",
        upstreamCommit: "2a285616cf5ef219f92573e452886a98db2949e9",
        renderDirectory: renderDir,
      });
    }
    if (req.method === "GET" && url.pathname.startsWith("/renders/")) {
      const filename = path.basename(url.pathname.slice("/renders/".length));
      const file = path.join(renderDir, filename);
      if (!fs.existsSync(file)) return json(res, 404, { error: "Render not found" });
      res.writeHead(200, { "content-type": "video/mp4", "content-length": fs.statSync(file).size, "cache-control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized" });
    if (req.method === "POST" && url.pathname === "/render") {
      const body = await readJson(req);
      const props = {
        title: String(body.title || "BharatShop Product"),
        subtitle: String(body.subtitle || "AI-designed product creative"),
        cta: String(body.cta || "Shop now"),
        imageUrl: String(body.imageUrl || ""),
        accent: String(body.accent || "#f97316"),
      };
      const result = await renderProductAd(props);
      const base = `http://${req.headers.host || `127.0.0.1:${port}`}`;
      return json(res, 200, { ok: true, filename: result.filename, url: `${base}/renders/${encodeURIComponent(result.filename)}` });
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BharatShop Remotion service listening on http://127.0.0.1:${port}`);
});
