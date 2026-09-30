import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadSession(env, factory) {
  const source = ts.transpileModule(readFileSync(new URL('../src/utils/supabase/middleware.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output = { exports: {} };
  const dependencies = {
    '@supabase/ssr': { createServerClient: factory },
    './config': { getSupabaseConfig: () => ({ url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }) },
    'next/server': { NextResponse: { next: ({ request }) => {
      const writes = [];
      return { request, headers: new Headers(), cookies: { set: (...cookie) => writes.push(cookie) }, writes };
    } } },
  };
  runInNewContext(source, { module: output, exports: output.exports, require: name => dependencies[name], process: { env } });
  return output.exports.updateSession;
}

test('refresh propagates request cookies, browser cookies, and private cache headers', async () => {
  const values = new Map([['sb-test-auth-token', 'old']]);
  const request = { cookies: {
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    set: (name, value) => values.set(name, value),
  } };
  let claimsCalled = 0;
  const refresh = loadSession({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only' }, (_url, _key, { cookies }) => ({ auth: {
    getClaims: async () => {
      claimsCalled++;
      assert.equal(cookies.getAll()[0].value, 'old');
      cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { sameSite: 'lax' } }], { Pragma: 'no-cache', Expires: '0' });
      return { data: { claims: null }, error: null };
    },
  } }));
  const response = await refresh(request);
  assert.equal(claimsCalled, 1);
  assert.equal(values.get('sb-test-auth-token'), 'refreshed');
  assert.equal(response.writes[0][1], 'refreshed');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('expires'), '0');
});

test('unconfigured optional integration does not instantiate an auth client', async () => {
  const refresh = loadSession({}, () => { throw new Error('must not initialize'); });
  assert.ok(await refresh({ cookies: {} }));
});
