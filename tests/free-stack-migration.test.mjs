import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("AI provider supports Gemini without removing the local Gemma fallback", () => {
  const provider = read("src/lib/ai/provider.ts");
  assert.match(provider, /GEMINI_API_KEY/);
  assert.match(provider, /GOOGLE_AI_API_KEY/);
  assert.match(provider, /gemini-3\.7-flash/);
  assert.match(provider, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(provider, /functionDeclarations/);
  assert.match(provider, /local-openai-compatible/);
  assert.match(provider, /LOCAL_AI_BASE_URL/);
});

test("database runtime can use a Supabase Postgres URL without destructive migration", () => {
  const database = read("src/db/index.ts");
  assert.match(database, /process\.env\.DATABASE_URL \|\| process\.env\.SUPABASE_DB_URL/);
  assert.match(database, /process\.env\.NETLIFY/);
  assert.match(database, /defaultPoolMax = .*\? 2 : 5/);
  assert.doesNotMatch(database, /DROP\s+(TABLE|DATABASE)|TRUNCATE/i);
});

test("Netlify scheduled function queues bounded work instead of running long AI inline", () => {
  const scheduler = read("netlify/functions/company-scheduler.mjs");
  const route = read("src/app/api/automation/free-stack-schedule/route.ts");
  assert.match(scheduler, /schedule: "10 2 \* \* \*"/);
  assert.match(scheduler, /\/api\/automation\/free-stack-schedule/);
  assert.match(scheduler, /AbortSignal\.timeout\(20_000\)/);
  assert.match(route, /status: "QUEUED"/);
  assert.match(route, /scheduledFreeStackCycle: true/);
  assert.match(route, /source-discovery/);
  assert.match(route, /listing/);
  assert.match(route, /marketing/);
  assert.match(route, /learning/);
  assert.match(route, /never activates paid spend/);
  assert.doesNotMatch(route, /executeCompanyWorkItem/);
});

test("free-stack environment contract keeps current production paths reversible", () => {
  const env = read(".env.example");
  const netlify = read("netlify.toml");
  assert.match(env, /DATABASE_URL=/);
  assert.match(env, /SUPABASE_DB_URL=/);
  assert.match(env, /BHARATSHOP_AUTOMATION_TOKEN=/);
  assert.match(env, /GEMINI_API_KEY=/);
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.match(env, /Never commit real credentials/);
  assert.match(netlify, /command = "npm run build"/);
  assert.match(netlify, /NODE_VERSION = "24"/);
  assert.doesNotMatch(netlify, /publish\s*=/);
});
