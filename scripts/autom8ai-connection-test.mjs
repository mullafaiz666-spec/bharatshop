#!/usr/bin/env node

import { config as loadDotEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) loadDotEnv({ path: envLocal, override: false });

const rawUrl = String(process.env.AUTOM8AI_WEBHOOK_URL || "").trim();
if (!rawUrl) {
  console.error("Autom8AI webhook is not configured in .env.local");
  process.exit(1);
}

let url;
try {
  url = new URL(rawUrl);
} catch {
  console.error("Autom8AI webhook URL is invalid.");
  process.exit(1);
}

const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
if (url.protocol !== "https:" && !local) {
  console.error("Autom8AI webhook must use HTTPS unless it targets localhost.");
  process.exit(1);
}

const token = String(process.env.AUTOM8AI_WEBHOOK_TOKEN || "").trim();
const payload = {
  schema: "bharatshop.autom8ai.v1",
  event: "bharatshop.connection.test",
  requestedAt: new Date().toISOString(),
  source: "local-verifier",
  dryRun: true,
  safety: {
    autoPublish: false,
    adSpend: false,
    productMutation: false,
    createsOrders: false,
    createsPayments: false,
    createsApprovals: false,
    mutatesDatabase: false,
    deploys: false,
    requiresHumanReview: true,
  },
  creative: {
    purpose: "Verify BharatShop can deliver a JSON event to the configured Autom8AI Generic Webhook Trigger.",
    instruction: "Acknowledge receipt only. Do not render media, publish, spend, or mutate external state.",
  },
};

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": "BharatShop-Autom8AI-Connection-Test/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
  });

  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text ? text.slice(0, 500) : null; }

  const ok = response.status >= 200 && response.status < 400;
  console.log(JSON.stringify({
    ok,
    mode: "AUTOM8AI_DRY_RUN_CONNECTION_TEST",
    httpStatus: response.status,
    webhookHost: url.hostname,
    tokenUsed: Boolean(token),
    response: body,
    safety: payload.safety,
  }, null, 2));

  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    mode: "AUTOM8AI_DRY_RUN_CONNECTION_TEST",
    webhookHost: url.hostname,
    tokenUsed: Boolean(token),
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
