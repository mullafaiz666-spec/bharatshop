#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const argv = process.argv.slice(2);
const action = argv.shift() || "status";
const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value || ""));
const enabled = truthy(process.env.PIXVERSE_ENABLED);
const creditSpendAllowed = truthy(process.env.PIXVERSE_ALLOW_CREDIT_SPEND);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function takeFlag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`, 2);
  argv.splice(index, 2);
  return value;
}

function takeBool(name) {
  const index = argv.indexOf(name);
  if (index === -1) return false;
  argv.splice(index, 1);
  return true;
}

function validateNoUnknown() {
  if (argv.length) fail(`Unknown argument(s): ${argv.join(" ")}`, 2);
}

function runPixVerse(args, { passthrough = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("pixverse", args, {
      shell: false,
      stdio: passthrough ? "inherit" : ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    if (!passthrough) {
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    }

    child.on("error", (error) => {
      if (error?.code === "ENOENT") {
        reject(new Error("PixVerse CLI is not installed. Install it with: npm install -g pixverse"));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function ensureAuthenticated() {
  const result = await runPixVerse(["auth", "status", "--json"]);
  if (result.code !== 0) {
    const details = result.stderr.trim() || result.stdout.trim();
    throw new Error(`PixVerse authentication is not ready.${details ? ` ${details}` : " Run: pixverse auth login"}`);
  }
  return result.stdout.trim();
}

async function promptValue() {
  const literal = takeFlag("--prompt");
  const file = takeFlag("--prompt-file");
  if (literal && file) fail("Use either --prompt or --prompt-file, not both", 2);
  if (file) return (await readFile(file, "utf8")).trim();
  return literal?.trim() || "";
}

async function createAsset() {
  const type = (takeFlag("--type") || "image").toLowerCase();
  if (!new Set(["image", "video"]).has(type)) fail("--type must be image or video", 2);

  const prompt = await promptValue();
  if (!prompt) fail("A prompt is required via --prompt or --prompt-file", 2);

  const sourceImage = takeFlag("--image");
  const model = takeFlag("--model");
  const quality = takeFlag("--quality");
  const aspectRatio = takeFlag("--aspect-ratio");
  const duration = takeFlag("--duration");
  const count = takeFlag("--count");
  const execute = takeBool("--execute");
  validateNoUnknown();

  const command = ["create", type, "--prompt", prompt];
  if (sourceImage) command.push("--image", sourceImage);
  if (model) command.push("--model", model);
  if (quality) command.push("--quality", quality);
  if (aspectRatio) command.push("--aspect-ratio", aspectRatio);
  if (duration) command.push("--duration", duration);
  if (count) command.push("--count", count);
  command.push("--json");

  if (!execute) {
    console.log(JSON.stringify({
      ok: true,
      mode: "PLAN_ONLY",
      provider: "pixverse-cli",
      enabled,
      creditSpendAllowed,
      action: "create",
      type,
      command: ["pixverse", ...command],
      note: "No PixVerse generation was started. Add --execute and explicitly enable credit spend to run it.",
    }, null, 2));
    return;
  }

  if (!enabled) fail("PixVerse execution is disabled. Set PIXVERSE_ENABLED=true only on an authorized creative worker.", 3);
  if (!creditSpendAllowed) fail("PixVerse generation can consume credits. Set PIXVERSE_ALLOW_CREDIT_SPEND=true to authorize billable generation.", 4);

  await ensureAuthenticated();
  const result = await runPixVerse(command);
  if (result.code !== 0) {
    const details = result.stderr.trim() || result.stdout.trim();
    fail(`PixVerse generation failed with exit code ${result.code}.${details ? ` ${details}` : ""}`, result.code);
  }
  process.stdout.write(result.stdout);
}

async function main() {
  if (action === "status") {
    validateNoUnknown();
    const result = await runPixVerse(["auth", "status", "--json"]);
    if (result.code !== 0) {
      const details = result.stderr.trim() || result.stdout.trim();
      fail(details || "PixVerse is not authenticated. Run: pixverse auth login", result.code);
    }
    process.stdout.write(result.stdout);
    return;
  }

  if (action === "capabilities") {
    validateNoUnknown();
    const result = await runPixVerse(["capabilities", "create", "--json"]);
    if (result.code !== 0) fail(result.stderr.trim() || "Could not read PixVerse capabilities", result.code);
    process.stdout.write(result.stdout);
    return;
  }

  if (action === "create") {
    await createAsset();
    return;
  }

  if (action === "download") {
    const id = takeFlag("--id");
    const type = (takeFlag("--type") || "image").toLowerCase();
    const dest = takeFlag("--dest") || ".pixverse";
    validateNoUnknown();
    if (!id) fail("--id is required", 2);
    if (!new Set(["image", "video", "audio"]).has(type)) fail("--type must be image, video, or audio", 2);
    const result = await runPixVerse(["asset", "download", id, "--type", type, "--dest", dest], { passthrough: true });
    if (result.code !== 0) fail(`PixVerse asset download failed with exit code ${result.code}`, result.code);
    return;
  }

  fail("Usage: pixverse-creative.mjs <status|capabilities|create|download> [options]", 2);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
