import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localCompanyWorkerErrors, localCompanyHealthErrors } from "../scripts/local-company-worker-config.mjs";

const supervisor = await readFile(new URL("../scripts/run-24x7-agency.ps1", import.meta.url), "utf8");
const manager = await readFile(new URL("../scripts/manage-24x7-agency.ps1", import.meta.url), "utf8");
const pairer = await readFile(new URL("../scripts/pair-live-24x7-agency.ps1", import.meta.url), "utf8");
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

  const migrationBlocked = localCompanyWorkerErrors(validEnv({ BHARATSHOP_MIGRATION_VERIFIED: "false" }));
  assert.ok(migrationBlocked.some((message) => /MIGRATION_VERIFIED/.test(message)));

  const publicAiBlocked = localCompanyWorkerErrors(validEnv({ AI_BASE_URL: "http://0.0.0.0:11555" }));
  assert.ok(publicAiBlocked.some((message) => /private BharatShop Qwen shim/.test(message)));

  const wrongProviderBlocked = localCompanyWorkerErrors(validEnv({ AI_PROVIDER: "gemini" }));
  assert.ok(wrongProviderBlocked.some((message) => /local-openai-compatible/.test(message)));
});

test("live health gate requires Netlify, the accepted revision and production Postgres readiness", () => {
  const revision = "b".repeat(40);
  assert.deepEqual(localCompanyHealthErrors({
    hosting: { netlify: true },
    revision,
    readiness: { postgres: { ready: true } },
  }, revision), []);

  assert.ok(localCompanyHealthErrors({
    hosting: { netlify: true },
    revision: "c".repeat(40),
    readiness: { postgres: { ready: true } },
  }, revision).some((message) => /revision/.test(message)));
});

test("supervisor keeps Ollama private and preflights before claiming live work", () => {
  assert.match(supervisor, /127\.0\.0\.1:11434/);
  assert.match(supervisor, /127\.0\.0\.1:11555/);
  assert.match(supervisor, /run-local-company-worker\.mjs/);
  assert.match(supervisor, /--check/);
  assert.match(supervisor, /BLOCKED_CONFIGURATION/);
  assert.doesNotMatch(supervisor, /OLLAMA_HOST\s*=\s*["']0\.0\.0\.0/);
});

test("local worker requires exact local/live revision parity and reuses the guarded native worker", () => {
  assert.match(launcher, /head !== process\.env\.BHARATSHOP_NATIVE_REVISION/);
  assert.match(launcher, /scripts\/workers\/native-company-worker\.ts/);
  assert.match(launcher, /Private local Ollama\/Qwen shim is not ready/);
});

test("live pairing never marks an unverified database migration as accepted", () => {
  assert.match(pairer, /BHARATSHOP_AUTOMATION_TOKEN/);
  assert.match(pairer, /bharatshop-35fd\.netlify\.app/);
  assert.doesNotMatch(pairer, /Upsert-Env\s+\$EnvFile\s+["']BHARATSHOP_MIGRATION_VERIFIED["']\s+["']true["']/i);
});

test("Windows scheduled task is restartable and 24x7 commands are wired", () => {
  assert.match(manager, /BharatShop-Agency-24x7/);
  assert.match(manager, /RestartCount 999/);
  assert.match(manager, /StartWhenAvailable/);
  assert.equal(pkg.scripts["agency:24x7"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-24x7-agency.ps1");
  assert.equal(pkg.scripts["agency:24x7:pair-live"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pair-live-24x7-agency.ps1");
  assert.equal(pkg.scripts["agency:24x7:worker:check"], "node scripts/run-local-company-worker.mjs --check");
  assert.equal(pkg.scripts["agency:24x7:install"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/manage-24x7-agency.ps1 -Mode Install");
});
