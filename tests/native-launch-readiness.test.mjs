import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nativeEnvironmentErrors } from "../scripts/check-netlify-native-env.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function validNativeEnv(overrides = {}) {
  return {
    CONTEXT: "deploy-preview",
    SUPABASE_DB_URL: "postgresql://postgres.example:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
    ADMIN_SESSION_SECRET: "12345678901234567890123456789012",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "test-only-password",
    BHARATSHOP_AUTOMATION_TOKEN: "test-only-automation-token",
    AI_PROVIDER: "local-openai-compatible",
    AI_BASE_URL: "https://ai.example.com/v1",
    SEARXNG_URL: "https://search.example.com",
    RAZORPAY_KEY_ID: "rzp_test_example",
    RAZORPAY_KEY_SECRET: "test-only-secret",
    RAZORPAY_WEBHOOK_SECRET: "test-only-webhook-secret",
    CASHFREE_CLIENT_ID: "test-only-client-id",
    CASHFREE_CLIENT_SECRET: "test-only-client-secret",
    SUPABASE_SERVICE_ROLE_KEY: "test-only-service-key",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_DIGITAL_BUCKET: "bharatshop-digital",
    BHARATSHOP_PUBLIC_ORIGIN: "https://bharatshop.example.com",
    BHARATSHOP_NATIVE_ORIGIN: "https://bharatshop.example.com",
    ...overrides,
  };
}

test("configured agent readiness recognizes Supabase DB and the real AI provider abstraction", () => {
  const readiness = read("src/lib/agents/readiness.ts");
  assert.match(readiness, /aiConfigured/);
  assert.match(readiness, /process\.env\.DATABASE_URL \|\| process\.env\.SUPABASE_DB_URL/);
  assert.match(readiness, /to_regclass\('public\.agent_company_goals'\)/);
  assert.match(readiness, /to_regclass\('public\.agent_chat_messages'\)/);
});

test("native preflight accepts a hosted free-first OpenAI-compatible Gemma route", () => {
  assert.deepEqual(nativeEnvironmentErrors(validNativeEnv()), []);
});

test("native preflight also accepts Gemini when a Gemini key is configured", () => {
  const env = validNativeEnv({
    AI_PROVIDER: "gemini",
    AI_BASE_URL: "",
    GEMINI_API_KEY: "test-only-gemini-key",
    GEMINI_MODEL: "gemini-test-model",
  });
  assert.deepEqual(nativeEnvironmentErrors(env), []);
});

test("native production remains fail-closed before migration parity is verified", () => {
  const errors = nativeEnvironmentErrors(validNativeEnv({ CONTEXT: "production", BHARATSHOP_MIGRATION_VERIFIED: "false" }));
  assert.ok(errors.some((error) => error.includes("BHARATSHOP_MIGRATION_VERIFIED")));
});

test("agent runtime SQL is additive and locks internal tables away from Data API roles", () => {
  const sql = read("ops/sql/agent-runtime-foundation.sql");
  for (const table of ["agent_company_goals", "agent_work_items", "agent_shared_events", "agent_chat_messages"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /REVOKE ALL ON TABLE public\.agent_work_items FROM anon, authenticated/);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
});

test("launch health is read-only and exposes a one-command certification path", () => {
  const launch = read("src/lib/launch/readiness.ts");
  const route = read("src/app/api/health/launch/route.ts");
  const script = read("scripts/native-launch-readiness.mjs");
  const pkg = JSON.parse(read("package.json"));
  assert.match(launch, /readyForCutover/);
  assert.match(launch, /fullyLive/);
  assert.match(launch, /agents\.summary\.allReady/);
  assert.match(launch, /This probe never changes database state/);
  assert.doesNotMatch(launch, /pool\.query\(/);
  assert.match(route, /nativeLaunchReadiness/);
  assert.match(route, /status: readiness\.readyForCutover \? 200 : 503/);
  assert.match(script, /\/api\/health\/launch\?deep=1/);
  assert.equal(pkg.scripts["launch:check"], "node scripts/native-launch-readiness.mjs");
});
