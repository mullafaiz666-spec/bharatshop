#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const envFile = join(root, ".env.local");
const siteId = process.env.BHARATSHOP_NETLIFY_SITE_ID || "75b5c168-6679-479d-b3a6-244e393fe1b0";
const origin = String(process.env.BHARATSHOP_AGENT_ORIGIN || process.env.BHARATSHOP_PUBLIC_ORIGIN || "https://bharatshop-35fd.netlify.app").replace(/\/+$/, "");

function readEnv(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) map.set(match[1].trim(), match[2].trim());
  }
  return map;
}

function upsertEnv(path, values) {
  const existing = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const keys = new Set(Object.keys(values));
  const kept = existing.filter((line) => {
    const match = line.match(/^\s*([^#=]+)=/);
    return !(match && keys.has(match[1].trim()));
  });
  for (const [key, value] of Object.entries(values)) kept.push(`${key}=${value}`);
  writeFileSync(path, `${kept.filter((line, index, arr) => !(index === arr.length - 1 && line === "")).join("\n")}\n`, "utf8");
}

function runNetlify(args) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["--yes", "netlify-cli@latest", ...args], {
    cwd: root,
    stdio: "inherit",
    windowsHide: false,
    shell: false,
  });
  if (result.status !== 0) throw new Error("Netlify CLI command failed. Authenticate Netlify CLI, then rerun pairing.");
}

async function liveRevision() {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(20_000), cache: "no-store", redirect: "error" });
    if (!response.ok) return "";
    const health = await response.json();
    const revision = String(health?.revision || "");
    return /^[a-f0-9]{40}$/.test(revision) ? revision : "";
  } catch {
    return "";
  }
}

try {
  const env = readEnv(envFile);
  const token = String(env.get("BHARATSHOP_AUTOMATION_TOKEN") || env.get("AUTOMATION_TOKEN") || randomBytes(32).toString("hex"));
  const revision = await liveRevision();

  const values = {
    BHARATSHOP_AUTOMATION_TOKEN: token,
    AUTOMATION_TOKEN: token,
    BHARATSHOP_AGENT_ORIGIN: origin,
    BHARATSHOP_PUBLIC_ORIGIN: origin,
    PERSONAL_AI_MODEL: "qwen3.5:4b",
    AI_PROVIDER: "local-openai-compatible",
    AI_BASE_URL: "http://127.0.0.1:11555",
    AI_TEXT_MODEL: "qwen3.5:4b",
  };
  if (revision) values.BHARATSHOP_NATIVE_REVISION = revision;
  upsertEnv(envFile, values);

  console.log("Pairing private automation authentication with the existing Netlify production Functions environment.");
  console.log("The token value will not be printed.");
  runNetlify(["env:set", "BHARATSHOP_AUTOMATION_TOKEN", token, "--context", "production", "--scope", "functions", "--secret", "--site", siteId]);

  console.log("Live origin and private automation authentication are paired locally and in Netlify configuration.");
  if (revision) console.log(`Accepted live revision recorded: ${revision}`);
  else console.log("Live revision was not available yet; worker execution remains safely blocked.");
  console.log("BHARATSHOP_MIGRATION_VERIFIED was not changed. Database parity must be verified separately before live work can run.");
  console.log("A new Netlify deployment is required before the running production Functions receive a changed environment value.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
