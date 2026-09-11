import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const launcher = require("../pinokio.js");
const installer = require("../install.js");
const appStart = require("../start.js");
const aiStart = require("../start-local-ai.js");

test("Pinokio launcher exposes an optional local workstation", async () => {
  assert.equal(launcher.version, "8.0");
  assert.match(launcher.title, /BharatShop/i);

  const menu = await launcher.menu({}, {
    exists: () => true,
    running: () => false,
    local: () => null,
  });

  assert.ok(menu.some((item) => item.href === "start.js"));
  assert.ok(menu.some((item) => item.href === "start-local-ai.js"));
});

test("Pinokio install and start scripts do not mutate production data", () => {
  const files = ["install.js", "start.js", "start-local-ai.js"];
  const forbidden = [
    /db:push/i,
    /drizzle-kit\s+push/i,
    /truncate\s+/i,
    /drop\s+(table|database)/i,
    /delete\s+from/i,
    /seed/i,
    /render\.com/i,
  ];

  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} must not contain ${pattern}`);
    }
  }
});

test("Pinokio scripts use locked dependencies and the existing Gemma gateway", () => {
  assert.equal(installer.run[0].params.message, "npm ci --no-audit --no-fund");
  assert.equal(appStart.daemon, true);
  assert.equal(aiStart.daemon, true);

  const aiShell = aiStart.run.find((step) => step.method === "shell.run");
  assert.equal(aiShell.params.env.GEMMA_MODEL, "gemma3:270m-it-qat");
  assert.match(aiShell.params.message, /local-ai\/start\.sh/);
  assert.match(aiShell.params.message, /Ollama is not installed/i);
});
