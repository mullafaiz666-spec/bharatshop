#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

function dockerDesktopCandidates() {
  if (process.platform !== "win32") return [];
  return [
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Docker", "Docker", "Docker Desktop.exe") : "",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Docker", "Docker Desktop.exe") : "",
  ].filter(Boolean);
}

function startDockerDesktopIfInstalled() {
  const executable = dockerDesktopCandidates().find((candidate) => existsSync(candidate));
  if (!executable) return { started: false, reason: "not-found" };
  const child = spawn(executable, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return { started: true, reason: "launched" };
}

async function ensureDockerEngine() {
  const current = runDocker(["info", "--format", "{{.ServerVersion}}"]);
  if (current.ok) return { ok: true, action: "already-running" };

  const launch = startDockerDesktopIfInstalled();
  if (!launch.started) {
    return {
      ok: false,
      action: "docker-desktop-not-found",
      error: "Docker engine is unavailable and Docker Desktop executable was not found in the standard Windows locations.",
    };
  }

  for (let i = 0; i < 120; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const probe = runDocker(["info", "--format", "{{.ServerVersion}}"]);
    if (probe.ok) return { ok: true, action: "started-docker-desktop" };
  }

  return {
    ok: false,
    action: "docker-engine-timeout",
    error: "Docker Desktop was launched but the Docker engine did not become ready.",
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

  const docker = await ensureDockerEngine();
  if (!docker.ok) {
    console.error(JSON.stringify({
      ok: false,
      mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
      host: HOST,
      port: PORT,
      error: docker.error,
      next: "Start Docker Desktop manually if needed, then rerun. This helper will not create or replace the database container.",
      createdContainer: false,
      resetDatabase: false,
      removedContainer: false,
      reseededDatabase: false,
    }, null, 2));
    process.exit(1);
  }

  const inspect = runDocker(["inspect", "-f", "{{.State.Status}}", CONTAINER]);
  if (!inspect.ok) {
    console.error(JSON.stringify({
      ok: false,
      mode: "LOCAL_DB_EXISTING_SERVICE_ENSURE",
      host: HOST,
      port: PORT,
      dockerAction: docker.action,
      error: "Docker is running, but the preserved bharatshop-dev-db container was not found.",
      next: "Do not create a replacement automatically. Locate the preserved container/volume before proceeding.",
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
        dockerAction: docker.action,
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
