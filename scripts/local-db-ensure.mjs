#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import net from "node:net";

const HOST = "127.0.0.1";
const PORT = 55432;
const CONTAINER = "bharatshop-dev-db";

function portOpen(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function runDocker(args) {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: String(r.stdout || "").trim(),
    stderr: String(r.stderr || "").trim(),
  };
}

async function main() {
  if (await portOpen()) {
    console.log(JSON.stringify({
      ok: true,
      mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
      host: HOST,
      port: PORT,
      action: "already-listening",
      createdContainer: false,
      resetDatabase: false,
      removedContainer: false,
      reseededDatabase: false,
      mutatedApplicationData: false,
    }, null, 2));
    return;
  }

  const inspect = runDocker(["inspect", "-f", "{{.State.Status}}", CONTAINER]);
  if (!inspect.ok) {
    console.error(JSON.stringify({
      ok: false,
      mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
      host: HOST,
      port: PORT,
      error: "Existing Docker container bharatshop-dev-db is unavailable or Docker Desktop is not running.",
      next: "Start Docker Desktop, then rerun this command. This helper will not create or replace the database container.",
      createdContainer: false,
      resetDatabase: false,
      removedContainer: false,
      reseededDatabase: false,
    }, null, 2));
    process.exit(1);
  }

  const before = inspect.stdout.toLowerCase();
  if (before !== "running") {
    const started = runDocker(["start", CONTAINER]);
    if (!started.ok) {
      console.error(JSON.stringify({
        ok: false,
        mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
        error: "Could not start the existing bharatshop-dev-db container.",
        createdContainer: false,
        resetDatabase: false,
        removedContainer: false,
        reseededDatabase: false,
      }, null, 2));
      process.exit(1);
    }
  }

  for (let i = 0; i < 30; i += 1) {
    if (await portOpen()) {
      console.log(JSON.stringify({
        ok: true,
        mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
        host: HOST,
        port: PORT,
        container: CONTAINER,
        action: before === "running" ? "waited-for-listener" : "started-existing-container",
        createdContainer: false,
        resetDatabase: false,
        removedContainer: false,
        reseededDatabase: false,
        mutatedApplicationData: false,
      }, null, 2));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.error(JSON.stringify({
    ok: false,
    mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
    host: HOST,
    port: PORT,
    container: CONTAINER,
    error: "Existing database container did not expose 127.0.0.1:55432 in time.",
    createdContainer: false,
    resetDatabase: false,
    removedContainer: false,
    reseededDatabase: false,
  }, null, 2));
  process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
