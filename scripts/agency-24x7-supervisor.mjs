#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
dotenv.config({ path: join(root, ".env.local"), override: false });

const model = process.env.PERSONAL_AI_MODEL || process.env.AI_TEXT_MODEL || "qwen3.5:4b";
const origin = String(process.env.BHARATSHOP_AGENT_ORIGIN || process.env.BHARATSHOP_PUBLIC_ORIGIN || "http://127.0.0.1:3000").replace(/\/+$/, "");
const pollMs = Math.max(10_000, Number(process.env.BHARATSHOP_AGENCY_POLL_MS || 20_000));
const restartMs = Math.max(10_000, Number(process.env.BHARATSHOP_AGENCY_RESTART_MS || 15_000));
const stateHome = process.env.BHARATSHOP_AGENCY_STATE_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local"), "BharatShop", "Agency24x7");
const heartbeatFile = join(stateHome, "heartbeat.json");
const logFile = join(stateHome, "supervisor.log");
const pidFile = join(stateHome, "supervisor.pid");
const shimScript = join(root, "services", "ollama-qwen-shim", "server.mjs");
const workerScript = join(root, "scripts", "run-local-company-worker.mjs");

mkdirSync(stateHome, { recursive: true });
writeFileSync(pidFile, String(process.pid));

function log(message, level = "INFO") {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  appendFileSync(logFile, `${line}\n`, "utf8");
  console.log(line);
}

function heartbeat(state, detail = "", extra = {}) {
  writeFileSync(heartbeatFile, JSON.stringify({
    updatedAt: new Date().toISOString(),
    supervisorPid: process.pid,
    state,
    detail,
    origin,
    localModel: model,
    ...extra,
  }, null, 2), "utf8");
}

async function fetchJson(url, options = {}, timeoutMs = 8_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return data;
}

function findOllama() {
  const which = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["ollama"], { encoding: "utf8", windowsHide: false });
  if (which.status === 0) {
    const first = String(which.stdout || "").split(/\r?\n/).map(x => x.trim()).find(Boolean);
    if (first) return first;
  }
  if (process.platform === "win32") {
    const candidates = [
      join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe"),
      join(process.env.ProgramFiles || "", "Ollama", "ollama.exe"),
    ];
    return candidates.find(existsSync) || "";
  }
  return "ollama";
}

async function ollamaReady() {
  try {
    const data = await fetchJson("http://127.0.0.1:11434/api/tags", {}, 5_000);
    const names = Array.isArray(data?.models) ? data.models.map(x => x?.name || x?.model).filter(Boolean) : [];
    return { ready: true, hasModel: names.includes(model) };
  } catch {
    return { ready: false, hasModel: false };
  }
}

async function ensureOllama() {
  let status = await ollamaReady();
  const ollama = findOllama();
  if (!status.ready) {
    if (!ollama) throw new Error("Ollama executable not found");
    log("Starting Ollama on private loopback 127.0.0.1:11434.");
    const child = spawn(ollama, ["serve"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434", OLLAMA_NUM_PARALLEL: "1", OLLAMA_MAX_LOADED_MODELS: "1" },
    });
    child.unref();
    for (let i = 0; i < 30; i += 1) {
      await new Promise(r => setTimeout(r, 1_000));
      status = await ollamaReady();
      if (status.ready) break;
    }
  }
  if (!status.ready) throw new Error("Ollama did not become ready");
  if (!status.hasModel) {
    if (!ollama) throw new Error(`Model ${model} is missing and Ollama executable was not found`);
    log(`Pulling required local model ${model}.`);
    const pull = spawnSync(ollama, ["pull", model], { cwd: root, stdio: "inherit", windowsHide: false });
    if (pull.status !== 0) throw new Error(`Could not pull ${model}`);
  }
}

async function shimReady() {
  try {
    const data = await fetchJson("http://127.0.0.1:11555/health", {}, 5_000);
    return data?.ok === true && Array.isArray(data?.models) && data.models.includes(model);
  } catch {
    return false;
  }
}

async function ensureShim() {
  if (await shimReady()) return;
  if (!existsSync(shimScript)) throw new Error("Qwen compatibility shim is missing");
  log("Starting BharatShop Qwen shim on private loopback 127.0.0.1:11555.");
  const child = spawn(process.execPath, [shimScript], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    env: { ...process.env, OLLAMA_BASE_URL: "http://127.0.0.1:11434", OLLAMA_SHIM_HOST: "127.0.0.1", OLLAMA_SHIM_PORT: "11555" },
  });
  child.unref();
  for (let i = 0; i < 20; i += 1) {
    await new Promise(r => setTimeout(r, 1_000));
    if (await shimReady()) return;
  }
  throw new Error("Qwen compatibility shim did not become ready");
}

async function liveReady() {
  try {
    const health = await fetchJson(`${origin}/api/health`, {}, 15_000);
    return { ready: true, health };
  } catch {
    return { ready: false, health: null };
  }
}

function workerEnv() {
  return {
    ...process.env,
    BHARATSHOP_AGENT_ORIGIN: origin,
    BHARATSHOP_PUBLIC_ORIGIN: origin,
    PERSONAL_AI_MODEL: model,
    AGENCY_MODEL: model,
    AI_PROVIDER: "local-openai-compatible",
    AI_BASE_URL: "http://127.0.0.1:11555",
    LOCAL_AI_BASE_URL: "http://127.0.0.1:11555",
    AI_TEXT_MODEL: model,
    LOCAL_AI_TEXT_MODEL: model,
    PERSONAL_AI_CONTEXT: process.env.PERSONAL_AI_CONTEXT || "4096",
    AGENCY_CONTEXT: process.env.AGENCY_CONTEXT || "4096",
  };
}

function runWorker(checkOnly = false) {
  const args = [workerScript, ...(checkOnly ? ["--check"] : [])];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: false, env: workerEnv() });
  return result.status === 0;
}

async function queueDailyPlan(lastDate) {
  const token = String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
  const date = new Date().toISOString().slice(0, 10);
  if (!token || lastDate === date || origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost")) return lastDate;
  await fetchJson(`${origin}/api/automation/free-stack-schedule`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-automation-token": token, "content-type": "application/json" },
    body: "{}",
  }, 45_000);
  log("Daily company plan queued/checked successfully.");
  return date;
}

let stopping = false;
const stop = () => { stopping = true; heartbeat("STOPPING", "Shutdown requested"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

log(`BharatShop 24x7 Node supervisor starting. Origin=${origin} Model=${model}`);
heartbeat("STARTING", "Supervisor initializing");
let lastScheduleDate = "";
let restartCount = 0;

try {
  while (!stopping) {
    try {
      await ensureOllama();
      await ensureShim();
      const live = await liveReady();
      if (!live.ready) {
        heartbeat("WAITING_FOR_STOREFRONT", "Live /api/health is unavailable", { ollama: "READY", qwenShim: "READY", restartCount });
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }
      lastScheduleDate = await queueDailyPlan(lastScheduleDate);
      heartbeat("PREFLIGHT", "Checking guarded local worker", { ollama: "READY", qwenShim: "READY", originReady: true, restartCount });
      if (!runWorker(true)) {
        heartbeat("BLOCKED_CONFIGURATION", "Database/revision/authentication gate not accepted", { ollama: "READY", qwenShim: "READY", originReady: true, restartCount });
        await new Promise(r => setTimeout(r, 60_000));
        continue;
      }
      heartbeat("RUNNING", "Processing one guarded company queue pass", { ollama: "READY", qwenShim: "READY", originReady: true, restartCount });
      if (!runWorker(false)) {
        restartCount += 1;
        heartbeat("WORKER_ERROR", "Worker pass failed; watchdog will retry", { restartCount });
        await new Promise(r => setTimeout(r, restartMs));
        continue;
      }
      heartbeat("RUNNING", "Queue pass completed or queue is idle", { ollama: "READY", qwenShim: "READY", originReady: true, restartCount });
      await new Promise(r => setTimeout(r, pollMs));
    } catch (error) {
      restartCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      log(`Supervisor cycle error: ${message}`, "ERROR");
      heartbeat("SUPERVISOR_ERROR", message.slice(0, 300), { restartCount });
      await new Promise(r => setTimeout(r, restartMs));
    }
  }
} finally {
  rmSync(pidFile, { force: true });
  heartbeat("STOPPED", "Supervisor exited", { restartCount });
  log("BharatShop 24x7 Node supervisor stopped.");
}
