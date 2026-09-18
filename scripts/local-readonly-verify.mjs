#!/usr/bin/env node

import { config as loadDotEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envLocal = resolve(root, ".env.local");
if (existsSync(envLocal)) loadDotEnv({ path: envLocal, override: false });

const urls = {
  storefront: "http://127.0.0.1:3001/",
  bharatdrip: "http://127.0.0.1:3001/bharatdrip",
  fashion: "http://127.0.0.1:3001/dashboard/fashion",
  machineAi: "http://127.0.0.1:3002/",
  ollama: "http://127.0.0.1:11434/api/tags",
  qwenShim: "http://127.0.0.1:11555/health",
};

async function probe(name, url, expected = [200, 204, 301, 302, 303, 307, 308]) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return {
      name,
      ok: expected.includes(response.status),
      status: response.status,
      location: response.headers.get("location") || null,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function autom8Configuration() {
  const rawUrl = String(process.env.AUTOM8AI_WEBHOOK_URL || "").trim();
  const tokenPresent = Boolean(String(process.env.AUTOM8AI_WEBHOOK_TOKEN || "").trim());
  let urlValid = false;
  let webhookHost = null;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
      urlValid = parsed.protocol === "https:" || local;
      webhookHost = parsed.hostname;
    } catch {}
  }
  return {
    configured: Boolean(rawUrl && urlValid),
    webhookUrlPresent: Boolean(rawUrl),
    webhookUrlValid: urlValid,
    webhookHost,
    tokenPresent,
    tokenValue: "[HIDDEN]",
  };
}

const probes = await Promise.all([
  probe("BharatShop storefront", urls.storefront),
  probe("BharatDrip", urls.bharatdrip),
  probe("Fashion Studio", urls.fashion),
  probe("Machine AI", urls.machineAi),
  probe("Ollama", urls.ollama, [200]),
  probe("Qwen shim", urls.qwenShim, [200]),
]);

const autom8ai = autom8Configuration();
const runtimeOk = probes.every((item) => item.ok);

console.log(JSON.stringify({
  mode: "READ_ONLY_LOCAL_VERIFY",
  runtimeOk,
  probes,
  autom8ai,
  safety: {
    sendsAutom8Webhook: false,
    createsOrders: false,
    createsPayments: false,
    createsApprovals: false,
    deploys: false,
    mutatesDatabase: false,
  },
}, null, 2));

if (!runtimeOk) process.exitCode = 1;
