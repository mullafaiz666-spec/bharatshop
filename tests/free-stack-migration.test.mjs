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

test("Netlify scheduled function queues bounded idempotent work instead of running long AI inline", () => {
  const scheduler = read("netlify/functions/company-scheduler.mjs");
  const route = read("src/app/api/automation/free-stack-schedule/route.ts");
  assert.match(scheduler, /schedule: "10 2 \* \* \*"/);
  assert.match(scheduler, /\/api\/automation\/free-stack-schedule/);
  assert.match(scheduler, /AbortSignal\.timeout\(20_000\)/);
  assert.match(route, /ALREADY_QUEUED/);
  assert.match(route, /free-stack-daily-\$\{today\}/);
  assert.match(route, /ON CONFLICT\(id\) DO NOTHING/);
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
  assert.match(env, /BHARATSHOP_MIGRATION_VERIFIED=/);
  assert.match(env, /Never commit real credentials/);
  assert.match(netlify, /command = "npm run build"/);
  assert.match(netlify, /NODE_VERSION = "24"/);
  assert.doesNotMatch(netlify, /publish\s*=/);
});

test("native production deployment is blocked until database migration is verified", () => {
  const nativeCheck = read("scripts/check-netlify-native-env.mjs");
  assert.match(nativeCheck, /deployContext === 'production'/);
  assert.match(nativeCheck, /BHARATSHOP_MIGRATION_VERIFIED must be true for native production deployment/);
  assert.match(nativeCheck, /BHARATSHOP_NATIVE_WORKER_ENABLED cannot be true before database migration verification/);
  assert.match(nativeCheck, /BHARATSHOP_NATIVE_ORIGIN/);
});

test("Supabase adapters keep customer auth public-key based and storage signing server-only", () => {
  const supabase = read("src/lib/supabase/rest.ts");
  assert.match(supabase, /\/auth\/v1\/user/);
  assert.match(supabase, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(supabase, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(supabase, /\/storage\/v1\/object\/sign/);
  assert.match(supabase, /expiresIn/);
  assert.match(supabase, /normalizedPath\.includes\("\.\."\)/);
  assert.doesNotMatch(supabase, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
});

test("Supabase copy verification is read-only and blocks cutover on count mismatch", () => {
  const verification = read("scripts/verify-supabase-copy.mjs");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["db:verify-supabase"], "node scripts/verify-supabase-copy.mjs");
  assert.match(verification, /pg_catalog\.pg_class/);
  assert.match(verification, /SET LOCAL row_security = off/);
  assert.match(verification, /select count\(\*\)::bigint/);
  assert.match(verification, /No cutover should occur/);
  assert.doesNotMatch(verification, /\b(insert|update|delete|drop|truncate|alter|create)\b/i);
});

test("free-stack readiness endpoint never exposes secret values", () => {
  const health = read("src/app/api/health/free-stack/route.ts");
  assert.match(health, /readyForNetlifyDeploy/);
  assert.match(health, /readyForSupabaseCutover/);
  assert.match(health, /migrationVerified/);
  assert.match(health, /BHARATSHOP_MIGRATION_VERIFIED/);
  assert.match(health, /DATABASE_URL remains authoritative/);
  assert.match(health, /supabaseRuntimeStatus/);
  assert.doesNotMatch(health, /SUPABASE_SERVICE_ROLE_KEY\s*:/);
  assert.doesNotMatch(health, /GEMINI_API_KEY\s*:/);
});
