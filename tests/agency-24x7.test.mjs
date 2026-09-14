import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localCompanyWorkerErrors, localCompanyHealthErrors } from "../scripts/local-company-worker-config.mjs";

const supervisor = await readFile(new URL("../scripts/agency-24x7-supervisor.mjs", import.meta.url), "utf8");
const manager = await readFile(new URL("../scripts/agency-24x7-manager.mjs", import.meta.url), "utf8");
const pairer = await readFile(new URL("../scripts/pair-live-24x7-agency.mjs", import.meta.url), "utf8");
const launcher = await readFile(new URL("../scripts/run-local-company-worker.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function validEnv(overrides = {}) {
  return {
    BHARATSHOP_MIGRATION_VERIFIED: "true",
    SUPABASE_DB_URL: "postgresql://worker:secret@db.example.supabase.co:5432/postgres",
    BHARATSHOP_PUBLIC_ORIGIN: "https://bharatshop-35fd.netlify.app",
    BHARATSHOP_NATIVE_REVISION: "a".repeat(40),
    BHARATSHOP_AUTOMATION_TOKEN: "private-worker-token",
    AI_PROVIDER: "local-openai-compatible",
    AI_BASE_URL: "http://127.0.0.1:11555",
    AI_TEXT_MODEL: "qwen3.5:4b",
    ...overrides,
  };
}

test("24x7 worker accepts only the guarded local-Ollama + shared-DB configuration", () => {
  assert.deepEqual(localCompanyWorkerErrors(validEnv()), []);
  assert.ok(localCompanyWorkerErrors(validEnv({ BHARATSHOP_MIGRATION_VERIFIED: "false" })).some((message) => /MIGRATION_VERIFIED/.test(message)));
  assert.ok(localCompanyWorkerErrors(validEnv({ AI_BASE_URL: "http://0.0.0.0:11555" })).some((message) => /private BharatShop Qwen shim/.test(message)));
  assert.ok(localCompanyWorkerErrors(validEnv({ AI_PROVIDER: "gemini" })).some((message) => /local-openai-compatible/.test(message)));
});

test("live health gate requires Netlify, the accepted revision and production Postgres readiness", () => {
  const revision = "b".repeat(40);
  assert.deepEqual(localCompanyHealthErrors({ hosting: { netlify: true }, revision, readiness: { postgres: { ready: true } } }, revision), []);
  assert.ok(localCompanyHealthErrors({ hosting: { netlify: true }, revision: "c".repeat(40), readiness: { postgres: { ready: true } } }, revision).some((message) => /revision/.test(message)));
});

test("Node supervisor keeps Ollama and Qwen shim private and preflights before live work", () => {
  assert.match(supervisor, /127\.0\.0\.1:11434/);
  assert.match(supervisor, /127\.0\.0\.1:11555/);
  assert.match(supervisor, /run-local-company-worker\.mjs/);
  assert.match(supervisor, /--check/);
  assert.match(supervisor, /BLOCKED_CONFIGURATION/);
  assert.doesNotMatch(supervisor, /0\.0\.0\.0:11434/);
});

test("local worker requires exact local/live revision parity and reuses guarded native worker", () => {
  assert.match(launcher, /head !== process\.env\.BHARATSHOP_NATIVE_REVISION/);
  assert.match(launcher, /scripts\/workers\/native-company-worker\.ts/);
  assert.match(launcher, /Private local Ollama\/Qwen shim is not ready/);
});

test("live pairing uses Node and never marks an unverified database migration as accepted", () => {
  assert.match(pairer, /BHARATSHOP_AUTOMATION_TOKEN/);
  assert.match(pairer, /bharatshop-35fd\.netlify\.app/);
  assert.match(pairer, /netlify-cli@latest/);
  assert.doesNotMatch(pairer, /BHARATSHOP_MIGRATION_VERIFIED\s*[:=]\s*["']true["']/i);
  assert.equal(pkg.scripts["agency:24x7:pair-live"], "node scripts/pair-live-24x7-agency.mjs");
});

test("Windows startup manager uses user Startup folder without scheduled tasks, elevation or PowerShell bypass", () => {
  assert.match(manager, /Start Menu.*Programs.*Startup/s);
  assert.match(manager, /BharatShop-Agency-24x7\.cmd/);
  assert.doesNotMatch(manager, /Register-ScheduledTask|New-ScheduledTask|ExecutionPolicy|RunLevel Highest|schtasks/i);
  assert.equal(pkg.scripts["agency:24x7"], "node scripts/agency-24x7-supervisor.mjs");
  assert.equal(pkg.scripts["agency:24x7:worker:check"], "node scripts/run-local-company-worker.mjs --check");
  assert.equal(pkg.scripts["agency:24x7:install"], "node scripts/agency-24x7-manager.mjs install");
  assert.equal(pkg.scripts["agency:24x7:start"], "node scripts/agency-24x7-manager.mjs start");
  assert.equal(pkg.scripts["agency:24x7:stop"], "node scripts/agency-24x7-manager.mjs stop");
  assert.equal(pkg.scripts["agency:24x7:status"], "node scripts/agency-24x7-manager.mjs status");
});
