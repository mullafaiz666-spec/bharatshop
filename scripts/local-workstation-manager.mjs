#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const scripts = {
  machine: join(here, "machine-ai-manager.mjs"),
  machineWeb: join(here, "machine-ai-web-manager.mjs"),
  storefront: join(here, "local-storefront-manager.mjs"),
};

function run(label, script, command, extra = []) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [script, command, ...extra], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      BHARATSHOP_LOCAL_APP_PORT: process.env.BHARATSHOP_LOCAL_APP_PORT || "3001",
      BHARATSHOP_MACHINE_UI_PORT: process.env.BHARATSHOP_MACHINE_UI_PORT || "3002",
    },
  });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
}

function start() {
  run("Machine AI supervisor", scripts.machine, "start");
  run("Machine AI web UI", scripts.machineWeb, "start");
  run("BharatShop storefront", scripts.storefront, "start");
  console.log("\nBharatShop workstation is ready.");
  console.log("Store / BharatDrip / Fashion Studio: http://127.0.0.1:3001");
  console.log("Machine AI: http://127.0.0.1:3002");
}

function status() {
  run("Machine AI supervisor", scripts.machine, "status");
  run("Machine AI web UI", scripts.machineWeb, "status");
  run("BharatShop storefront", scripts.storefront, "status");
}

function stop() {
  run("BharatShop storefront", scripts.storefront, "stop");
  run("Machine AI web UI", scripts.machineWeb, "stop");
  run("Machine AI supervisor", scripts.machine, "stop");
  console.log("\nBharatShop workstation stopped.");
}

const command = String(process.argv[2] || "status").toLowerCase();

try {
  if (command === "start") start();
  else if (command === "status") status();
  else if (command === "stop") stop();
  else throw new Error("Usage: node scripts/local-workstation-manager.mjs start|status|stop");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
