import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeEnvironmentErrors } from '../scripts/check-netlify-native-env.mjs';

const valid = () => ({
  SUPABASE_DB_URL: 'postgresql://test:fake-password@aws-0.example.pooler.supabase.com:6543/postgres',
  ADMIN_SESSION_SECRET: 'x'.repeat(32), BHARATSHOP_AUTOMATION_TOKEN: 'fake-token',
  AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key', GEMINI_MODEL: 'configured-model',
  RAZORPAY_KEY_ID: 'fake-id', RAZORPAY_KEY_SECRET: 'fake-secret', RAZORPAY_WEBHOOK_SECRET: 'fake-hook',
  CASHFREE_CLIENT_ID: 'fake-id', CASHFREE_CLIENT_SECRET: 'fake-secret',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key', SUPABASE_URL: 'https://example.supabase.co',
  BHARATSHOP_PUBLIC_ORIGIN: 'https://bharatshop-35fd.netlify.app',
});

test('native candidate requires its real runtime configuration', () => {
  assert.deepEqual(nativeEnvironmentErrors(valid()), []);
  assert.ok(nativeEnvironmentErrors({}).some(e => e.includes('SUPABASE_DB_URL')));
  const env = valid(); delete env.GEMINI_API_KEY;
  assert.ok(nativeEnvironmentErrors(env).some(e => e.includes('GEMINI_API_KEY')));
});
test('DATABASE_URL precedence cannot hide an old Render database', () => {
  const env = { ...valid(), DATABASE_URL: 'postgresql://test:secret@old.oregon-postgres.render.com/shop' };
  assert.ok(nativeEnvironmentErrors(env).some(e => e.includes('active database')));
});
test('Render and local inference dependencies block a native candidate', () => {
  for (const url of ['https://old.onrender.com', 'http://localhost:11434', 'not-a-url']) {
    assert.ok(nativeEnvironmentErrors({ ...valid(), AI_BASE_URL: url }).some(e => e.includes('AI_BASE_URL')));
  }
});
test('configuration failure messages never disclose supplied credentials', () => {
  const env = { ...valid(), DATABASE_URL: 'private-secret-invalid-url' };
  assert.ok(!JSON.stringify(nativeEnvironmentErrors(env)).includes(env.DATABASE_URL));
});
