import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

function studio({ failInsert = false, authenticated = true } = {}) {
  const queries = [];
  let released = false;
  const query = async (sql, args) => {
    queries.push({ sql, args });
    if (failInsert && sql.includes('INSERT INTO product_details')) throw new Error('database failure');
    return { rows: sql.includes('RETURNING id') ? [{ id: 42 }] : [] };
  };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/admin-auth': { getAdminUser: async () => authenticated ? { id: 7, name: 'Owner', role: 'admin' } : null },
    '@/db': { pool: { query, connect: async () => ({ query, release: () => { released = true; } }) } },
    '@/lib/public-origin': { publicOrigin: () => 'https://bharatshop-9w4a.onrender.com' },
    '@/lib/ai/agent-tools': { openAIJson: async () => { throw new Error('offline'); } },
    '@/lib/catalog/economics-policy': { catalogEconomicsPolicy: () => ({ minMarginPct: 20, minProfitInr: 50 }) },
    '@/lib/suppliers/qikink-rate-card': {
      QIKINK_PRODUCTS: [{ code: 'US22', name: 'Tee', audience: 'unisex' }],
      qikinkProductByCode: () => ({ code: 'US22', name: 'Tee', audience: 'unisex' }),
      qikinkCostForDesign: () => ({ prepaidLandedCostInr: 300, sourceUrl: 'https://qikink.com', productBaseInr: 200, printingInr: 50, shippingInr: 40, gstInr: 10, codInr: 30, codGstInr: 5, sizes: ['M'], productName: 'Tee' }),
    },
  };
  const source = ts.transpileModule(readFileSync('src/app/api/admin/fashion-studio/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  runInThisContext(`(function(require,module,exports){${source}\n})`)((name) => {
    assert.ok(name in mocks, name); return mocks[name];
  }, mod, mod.exports);
  return { route: mod.exports, queries, released: () => released };
}
const request = () => new Request('https://untrusted.invalid/api/admin/fashion-studio', {
  method: 'POST', body: JSON.stringify({ action: 'create', title: 'Original Signal Tee', designBrief: 'Original abstract geometry', targetPriceInr: 799 }),
});
test('design, images and audit commit together for the authenticated owner', async () => {
  const s = studio(); const response = await s.route.POST(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'CEO_PENDING');
  assert.ok(body.images.every(url => url.startsWith('https://bharatshop-9w4a.onrender.com/')));
  assert.equal(s.queries[0].sql, 'BEGIN');
  assert.equal(s.queries.at(-1).sql, 'COMMIT');
  assert.equal(s.queries.find(q => q.sql.includes('INSERT INTO products')).args.at(-1), 7);
  assert.equal(s.queries.find(q => q.sql.includes('INSERT INTO ai_activity_logs')).args.at(-1), 7);
  assert.ok(s.released());
});
test('failed detail write rolls back the entire design and releases connection', async () => {
  const s = studio({ failInsert: true });
  assert.equal((await s.route.POST(request())).status, 500);
  assert.equal(s.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!s.queries.some(q => q.sql === 'COMMIT'));
  assert.ok(s.released());
});
test('unauthenticated requests cannot create products or open a transaction', async () => {
  const s = studio({ authenticated: false });
  assert.equal((await s.route.POST(request())).status, 401);
  assert.equal(s.queries.length, 0);
});
test('design history and audit are scoped to the authenticated owner', async () => {
  const s = studio(); await s.route.GET();
  assert.equal(s.queries.length, 2);
  for (const q of s.queries) { assert.match(q.sql, /user_id=\$1/); assert.deepEqual(q.args, [7]); }
});
