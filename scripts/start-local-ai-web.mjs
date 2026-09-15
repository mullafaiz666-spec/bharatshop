#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const host = "127.0.0.1";
const port = process.env.LOCAL_AI_WEB_PORT || "3001";
const url = `http://${host}:${port}/local-ai`;

if (!existsSync(nextBin)) {
  console.error("Next.js is not installed in this checkout. Run npm.cmd ci first.");
  process.exit(2);
}

console.log(`\nBharatShop Laptop AI web screen`);
console.log(`Local URL: ${url}`);
console.log("The server is bound to loopback only. Press Ctrl+C to stop it.\n");

const child = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", port], {
  cwd: ROOT,
  env: { ...process.env, LOCAL_AI_WEB_ENABLED: "1" },
  stdio: "inherit",
  windowsHide: false,
});

const timer = setTimeout(() => {
  try {
    if (process.platform === "win32") {
      const browser = spawn("cmd.exe", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      browser.unref();
    }
  } catch {
    // The URL is printed above if automatic browser opening is unavailable.
  }
}, 2500);

timer.unref();

function stop(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 0);
});
