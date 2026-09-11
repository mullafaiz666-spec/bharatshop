import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin login fails closed until database and signed-session runtime are configured", () => {
  const route = read("src/app/api/auth/admin-login/route.ts");
  assert.match(route, /process\.env\.DATABASE_URL \|\| process\.env\.SUPABASE_DB_URL/);
  assert.match(route, /ADMIN_SESSION_SECRET/);
  assert.match(route, /ADMIN_RUNTIME_NOT_READY/);
  assert.match(route, /status: 503/);
});

test("deployment contract documents required administrator settings without secrets", () => {
  const env = read(".env.example");
  assert.match(env, /ADMIN_SESSION_SECRET=/);
  assert.match(env, /ADMIN_EMAIL=/);
  assert.match(env, /ADMIN_PASSWORD=/);
  assert.match(env, /ADMIN_BOOTSTRAP_SECRET=/);
  assert.match(env, /NEXT_PUBLIC_SITE_URL=/);
  assert.match(env, /SEARXNG_URL=/);
  assert.doesNotMatch(env, /ADMIN_SESSION_SECRET=\S{32,}/);
});

test("health reports Netlify commit and either supported database variable", () => {
  const health = read("src/app/api/health/route.ts");
  assert.match(health, /process\.env\.COMMIT_REF/);
  assert.match(health, /process\.env\.DATABASE_URL/);
  assert.match(health, /process\.env\.SUPABASE_DB_URL/);
  assert.match(health, /missing_database_url/);
});

test("free-stack health exposes only safe admin readiness booleans", () => {
  const health = read("src/app/api/health/free-stack/route.ts");
  assert.match(health, /sessionSecretConfigured/);
  assert.match(health, /databaseConfigured/);
  assert.match(health, /configuredAdminLogin/);
  assert.match(health, /readiness:[\s\S]*admin: admin\.ready/);
  assert.doesNotMatch(health, /ADMIN_SESSION_SECRET\s*:/);
  assert.doesNotMatch(health, /ADMIN_PASSWORD\s*:/);
});

test("Next 16 request boundary uses proxy instead of deprecated middleware", () => {
  assert.equal(existsSync(new URL("../src/middleware.ts", import.meta.url)), false);
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /export async function proxy/);
  assert.match(proxy, /bharatshop_admin_session/);
  assert.match(proxy, /ADMIN_SESSION_SECRET/);
  assert.match(proxy, /BHARATSHOP_AUTOMATION_TOKEN/);
});
