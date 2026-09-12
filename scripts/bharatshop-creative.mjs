#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = (args.shift() || "help").toLowerCase();

function flag(name, fallback = undefined) {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return true;
  return value;
}

function has(name) {
  return args.includes(`--${name}`);
}

const baseUrl = String(flag("base-url", process.env.BHARATSHOP_URL || process.env.PUBLIC_BASE_URL || "http://localhost:3000")).replace(/\/$/, "");
const token = String(flag("token", process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || ""));
const jsonMode = has("json");

function print(value) {
  if (jsonMode || typeof value !== "string") console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers || {}) },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text || `HTTP ${response.status}` }; }
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function help() {
  console.log(`BharatShop Creative CLI\n\nUsage:\n  npm run creative -- capabilities [--json]\n  npm run creative -- image --prompt "Original campaign visual" [--aspect-ratio 4:5] [--provider auto|free|google] [--output creative.png] [--json]\n  npm run creative -- fashion --product-id 123 [--command /autoimage] [--count 4] [--json]\n\nConnection:\n  --base-url URL   default: BHARATSHOP_URL, PUBLIC_BASE_URL, or http://localhost:3000\n  --token TOKEN    default: BHARATSHOP_AUTOMATION_TOKEN/AUTOMATION_TOKEN\n\nThe CLI calls BharatShop's own /api/creative endpoint. Generation endpoints require an automation token unless the request is made through an authenticated admin browser session.`);
}

async function main() {
  if (["help", "-h", "--help"].includes(command)) return help();

  if (["capabilities", "status"].includes(command)) {
    const data = await request("/api/creative", { method: "GET", headers: {} });
    return print(data);
  }

  if (command === "image") {
    const prompt = flag("prompt");
    if (!prompt || prompt === true) throw new Error("--prompt is required");
    const data = await request("/api/creative", {
      method: "POST",
      body: JSON.stringify({
        action: "image",
        prompt,
        aspectRatio: flag("aspect-ratio", "4:5"),
        provider: flag("provider", "auto"),
        seed: flag("seed") ? Number(flag("seed")) : undefined,
      }),
    });

    const output = flag("output");
    if (output && output !== true) {
      const match = String(data?.asset?.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) throw new Error("Creative API returned no raster data URL");
      const path = resolve(String(output));
      await writeFile(path, Buffer.from(match[2], "base64"));
      const summary = { ...data, asset: { ...data.asset, dataUrl: undefined, output: path } };
      return print(summary);
    }

    if (!jsonMode && data?.asset) {
      return print(`Created ${data.asset.type} with ${data.asset.provider} (${data.asset.width}x${data.asset.height}). Use --output <file> to save it.`);
    }
    return print(data);
  }

  if (command === "fashion") {
    const productId = flag("product-id");
    const productName = flag("product-name");
    if (!productId && !productName) throw new Error("--product-id or --product-name is required");
    const data = await request("/api/creative", {
      method: "POST",
      body: JSON.stringify({
        action: "fashion",
        command: flag("command", "/autoimage"),
        productId: productId ? Number(productId) : undefined,
        productName: productName || undefined,
        count: Number(flag("count", 4)),
        extraPrompt: flag("extra-prompt") || undefined,
      }),
    });
    return print(data);
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
