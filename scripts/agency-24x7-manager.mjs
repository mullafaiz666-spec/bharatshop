#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const supervisor = join(here, "agency-24x7-supervisor.mjs");
const stateHome = process.env.BHARATSHOP_AGENCY_STATE_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local"), "BharatShop", "Agency24x7");
const heartbeatFile = join(stateHome, "heartbeat.json");
const pidFile = join(stateHome, "supervisor.pid");
const startupDir = process.platform === "win32"
  ? join(process.env.APPDATA || join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
  : "";
const startupFile = process.platform === "win32" ? join(startupDir, "BharatShop-Agency-24x7.cmd") : "";

mkdirSync(stateHome, { recursive: true });

function readPid() {
  try { return Number(readFileSync(pidFile, "utf8").trim()) || 0; } catch { return 0; }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function showStatus() {
  const pid = readPid();
  console.log("\n=== BharatShop 24x7 Agency ===");
  console.log(`STARTUP ENTRY: ${startupFile && existsSync(startupFile) ? "Installed" : "Not installed"}`);
  console.log(`SUPERVISOR: ${pidAlive(pid) ? `Running (PID ${pid})` : "Stopped"}`);
  if (existsSync(heartbeatFile)) {
    try {
      const h = JSON.parse(readFileSync(heartbeatFile, "utf8"));
      console.log(`STATE: ${h.state || "unknown"}`);
      console.log(`UPDATED: ${h.updatedAt || "unknown"}`);
      console.log(`ORIGIN: ${h.origin || "unknown"}`);
      console.log(`LOCAL MODEL: ${h.localModel || "unknown"}`);
      console.log(`OLLAMA: ${h.ollama || "unknown"}`);
      console.log(`QWEN SHIM: ${h.qwenShim || "unknown"}`);
      console.log(`DETAIL: ${h.detail || ""}`);
    } catch {
      console.log("HEARTBEAT: unreadable");
    }
  } else {
    console.log("HEARTBEAT: not written yet");
  }
  console.log(`STATE HOME: ${stateHome}`);
}

function startSupervisor() {
  const pid = readPid();
  if (pidAlive(pid)) {
    console.log(`BharatShop 24x7 agency is already running (PID ${pid}).`);
    return;
  }
  if (!existsSync(supervisor)) throw new Error(`Supervisor missing: ${supervisor}`);
  const child = spawn(process.execPath, [supervisor], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  console.log("BharatShop 24x7 agency supervisor started.");
}

function stopSupervisor() {
  const pid = readPid();
  if (!pidAlive(pid)) {
    rmSync(pidFile, { force: true });
    console.log("BharatShop 24x7 agency supervisor is already stopped.");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Stop requested for BharatShop agency supervisor PID ${pid}.`);
  } catch {
    console.log("Could not signal the recorded supervisor PID; removing stale PID file.");
    rmSync(pidFile, { force: true });
  }
}

function installStartup() {
  if (process.platform !== "win32") throw new Error("Automatic startup installer currently supports Windows only.");
  mkdirSync(startupDir, { recursive: true });
  const node = process.execPath.replace(/"/g, '""');
  const script = supervisor.replace(/"/g, '""');
  const cwd = root.replace(/"/g, '""');
  const content = [
    "@echo off",
    "rem BharatShop user-logon startup entry. No elevation, no PowerShell bypass, no hidden scheduled task.",
    `cd /d "${cwd}"`,
    `start "BharatShop Agency 24x7" /min "${node}" "${script}"`,
    "exit /b 0",
    "",
  ].join("\r\n");
  writeFileSync(startupFile, content, "utf8");
  console.log(`Startup entry installed: ${startupFile}`);
  console.log("This starts only after your Windows user logs in. It does not create an elevated/pre-login task.");
}

function uninstallStartup() {
  if (startupFile) rmSync(startupFile, { force: true });
  console.log("BharatShop startup entry removed.");
}

const mode = String(process.argv[2] || "status").toLowerCase();
try {
  if (mode === "install") {
    installStartup();
    startSupervisor();
    setTimeout(showStatus, 2000);
  } else if (mode === "start") {
    startSupervisor();
    setTimeout(showStatus, 1500);
  } else if (mode === "stop") {
    stopSupervisor();
    setTimeout(showStatus, 800);
  } else if (mode === "uninstall") {
    stopSupervisor();
    uninstallStartup();
    setTimeout(showStatus, 800);
  } else if (mode === "status") {
    showStatus();
  } else {
    throw new Error("Usage: node scripts/agency-24x7-manager.mjs install|start|stop|status|uninstall");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
