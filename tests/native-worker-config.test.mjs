import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { nativeWorkerErrors, nativeHealthErrors } from '../scripts/native-worker-config.mjs';
const valid = {
  BHARATSHOP_NATIVE_WORKER_ENABLED: 'true', BHARATSHOP_MIGRATION_VERIFIED: 'true',
  SUPABASE_DB_URL: 'postgresql://postgres.project:dummy@aws-0.pooler.supabase.com:5432/postgres',
  BHARATSHOP_PUBLIC_ORIGIN: 'https://bharatshop-35fd.netlify.app',
  BHARATSHOP_NATIVE_REVISION: 'a'.repeat(40),
  BHARATSHOP_AUTOMATION_TOKEN: 'test-only', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-only', GEMINI_MODEL: 'configured-model',
};
test('native worker requires explicit migration and execution gates', () => {
  assert.deepEqual(nativeWorkerErrors(valid), []);
  assert(nativeWorkerErrors({ ...valid, BHARATSHOP_MIGRATION_VERIFIED: '' }).length);
  assert(nativeWorkerErrors({ ...valid, BHARATSHOP_NATIVE_WORKER_ENABLED: '' }).length);
});
test('native worker refuses Render, local, malformed and overriding source connections', () => {
  for (const database of ['postgres://user:pass@source.onrender.com/prod', 'postgres://user:pass@localhost/db', 'invalid']) {
    assert(nativeWorkerErrors({ ...valid, DATABASE_URL: database }).length);
  }
  assert(nativeWorkerErrors({ ...valid, AI_BASE_URL: 'https://other-provider.example' }).length);
  assert(nativeWorkerErrors({ ...valid, BHARATSHOP_PUBLIC_ORIGIN: 'https://bharatshop-9w4a.onrender.com' }).length);
});
test('native worker can bundle existing agent runtime without credentials or network use', () => {
  const result = spawnSync(process.execPath, ['scripts/run-native-company-worker.mjs', '--check'], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, ...valid }, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No connection or task execution attempted/);
});
test('missing credentials stop before connecting and do not echo secret values', () => {
  const result = spawnSync(process.execPath, ['scripts/run-native-company-worker.mjs'], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, DATABASE_URL: 'private-value-do-not-echo' }, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /private-value-do-not-echo/);
});

test('native health gate rejects proxy deployments, wrong revisions and missing dependencies', () => {
  const health = { hosting: { netlify: true }, revision: valid.BHARATSHOP_NATIVE_REVISION, provider: 'gemini', readiness: { postgres: { ready: true }, ai: { ready: true } } };
  assert.deepEqual(nativeHealthErrors(health, valid.BHARATSHOP_NATIVE_REVISION), []);
  assert(nativeHealthErrors({ ...health, hosting: { netlify: false } }, valid.BHARATSHOP_NATIVE_REVISION).length);
  assert(nativeHealthErrors(health, 'b'.repeat(40)).length);
  assert(nativeHealthErrors({ ...health, provider: 'gemini+fallback' }, valid.BHARATSHOP_NATIVE_REVISION).length);
  assert(nativeHealthErrors({}, valid.BHARATSHOP_NATIVE_REVISION).length);
});
