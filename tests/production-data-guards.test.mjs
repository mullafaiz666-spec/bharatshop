import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHmac, webcrypto } from 'node:crypto';
import ts from 'typescript';

function load(path, dependencies, env = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, process: { env }, crypto: webcrypto, TextEncoder, Uint8Array, URL });
  return compiledModule.exports;
}
const response = { json: (body, options) => ({ body, status: options.status }), next: () => ({ status: 200 }), redirect: () => ({ status: 307, cookies: { delete() {} } }) };

test('empty database lookup cannot create sample business records or fall back to user 1', async () => {
  const chain = { from() { return this; }, where() { return this; }, orderBy() { return this; }, async limit() { return []; } };
  const { ensureDemoDataSeeded } = load('src/lib/seed.ts', {
    '@/db': { db: { select: () => chain } }, '@/db/schema': { users: {} },
    'drizzle-orm': { asc() {}, inArray() {} },
  });
  await assert.rejects(ensureDemoDataSeeded(), /operator is not configured/);
});

test('bulk seed refuses without loading a database or product generator', async () => {
  const route = load('src/app/api/engine/bulk-seed/route.ts', { 'next/server': { NextResponse: response } });
  assert.equal((await route.POST()).status, 410);
});

const secret = 'a'.repeat(32);
const token = 'b'.repeat(64);
const expires = Math.floor(Date.now() / 1000) + 3600;
const signature = createHmac('sha256', secret).update(`${token}.${expires}`).digest('hex');
function request(path, cookie) {
  return { nextUrl: { pathname: path }, url: `https://example.com${path}`, headers: new Headers(), cookies: { get: () => cookie ? { value: cookie } : undefined } };
}
function proxyFor(getAdminUser) {
  return load('src/proxy.ts', { 'next/server': { NextResponse: response }, '@/lib/admin-auth': { getAdminUser } }, { ADMIN_SESSION_SECRET: secret }).proxy;
}
test('company cart rejects unauthenticated reads and mutations at request boundary', async () => {
  const proxy = proxyFor(() => { throw new Error('must not query unauthenticated requests'); });
  assert.equal((await proxy(request('/api/cart'))).status, 401);
  assert.equal((await proxy(request('/api/storefront/products'))).status, 200);
});
test('signed but revoked or demoted sessions cannot access protected APIs', async () => {
  const proxy = proxyFor(async () => null);
  assert.equal((await proxy(request('/api/overview', `${token}.${expires}.${signature}`))).status, 401);
});
test('valid persisted admin passes; database outage fails closed', async () => {
  const req = request('/api/overview', `${token}.${expires}.${signature}`);
  assert.equal((await proxyFor(async () => ({ id: 9, role: 'Admin' }))(req)).status, 200);
  assert.equal((await proxyFor(async () => { throw new Error('private database details'); })(req)).status, 503);
});


test('campaign drafts do not invent performance, spend, delivery or COD promises', () => {
  const { generateCampaign } = load('src/lib/productEngine.ts', {});
  const draft = generateCampaign({ title: 'Cotton Shirt', netProfitInr: 50, category: 'Fashion', aiTargetAudience: 'Adults', sellingPriceInr: 500 });
  assert.equal(draft.budgetInr, 0);
  assert.equal(draft.estimatedReachK, 0);
  assert.equal(draft.estimatedRoas, 0);
  assert.doesNotMatch(draft.bodyText, /COD|2–5|GST|Profit/);
});
