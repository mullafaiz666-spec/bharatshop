import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MACHINE_HOME = process.env.BHARATSHOP_MACHINE_AI_HOME || join(
  process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
  "BharatShop",
  "MachineAI",
);

const CONTROL_TOKEN_FILE = join(MACHINE_HOME, "control-token.txt");
const CONTROL_ORIGINS = new Set([
  "https://preview--nimble-bharatshop-control.apper.so",
]);

function ensureControlToken() {
  mkdirSync(MACHINE_HOME, { recursive: true });
  if (!existsSync(CONTROL_TOKEN_FILE)) {
    writeFileSync(CONTROL_TOKEN_FILE, crypto.randomBytes(32).toString("hex"), {
      encoding: "utf8",
      mode: 0o600,
    });
  }
  return readFileSync(CONTROL_TOKEN_FILE, "utf8").trim();
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isLoopbackHostname(hostname: string) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

export function machineControlHeaders(request: Request) {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
  };
  const origin = request.headers.get("origin") || "";
  if (CONTROL_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type, accept, x-bharatshop-control-token";
    headers["access-control-allow-private-network"] = "true";
    headers["vary"] = "Origin, Access-Control-Request-Private-Network";
  }
  return headers;
}

export function machineControlOptions(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!CONTROL_ORIGINS.has(origin)) {
    return Response.json({ error: "Origin is not authorized for Machine AI control." }, { status: 403 });
  }
  return new Response(null, { status: 204, headers: machineControlHeaders(request) });
}

export function authorizeMachineControl(request: Request) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    const origin = request.headers.get("origin") || "";

    if (!isLoopbackHostname(hostname)) return false;

    // Local tools and localhost UI remain trusted without a pairing token.
    if (!origin) return true;
    try {
      if (isLoopbackHostname(new URL(origin).hostname)) return true;
    } catch {
      return false;
    }

    if (!CONTROL_ORIGINS.has(origin)) return false;
    const supplied = request.headers.get("x-bharatshop-control-token") || "";
    return safeEqual(supplied, ensureControlToken());
  } catch {
    return false;
  }
}

export function controlTokenPathLabel() {
  ensureControlToken();
  return "%LOCALAPPDATA%\\BharatShop\\MachineAI\\control-token.txt";
}
