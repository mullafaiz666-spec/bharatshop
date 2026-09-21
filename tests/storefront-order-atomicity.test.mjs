import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function evaluate(code, imports) { const loaded = { exports: {} }; new Function('require', 'module', 'exports', code)(name => name in imports ? imports[name] : require(name), loaded, loaded.exports); return loaded.exports; }
const tokenPlan = evaluate(compile('../src/lib/payments/token-plan.ts'), {});
const route = compile('../src/app/api/storefront/orders/route.ts');
const payload = { customerName: 'Test Customer', customerEmail: 'test@example.invalid', customerPhone: '9000000000', customerAddress: 'Test address', customerCity: 'Mumbai', customerState: 'Maharashtra', customerPincode: '400001', productId: 1, quantity: 2 };
function setup({ failTable, price = '100.00' } = {}) {
 const state = { storefrontOrders: [], orders: [], aiActivityLogs: [] };
 let transactions = 0, locks = 0;
 const tables = Object.fromEntries(['storefrontOrders','orders','products','productDetails','aiActivityLogs'].map(name => [name, { name, id: 'id', orderRef: 'orderRef' }]));
 const product = { id: 1, userId: 1, title: 'Test product', brand: 'Generic', supplierName: 'Test', status: 'Published', stockCount: 10, sellingPriceInr: price, supplierCostInr: '30', shippingCostInr: '10', gstPct: '18', netProfitInr: '50' };
 const db = { async transaction(fn) {
   transactions++;
   const draft = structuredClone(state);
   const tx = {
    async execute() { locks++; },
    select() { return { from(table) { return { where(condition) { return { async limit() { if (table.name === 'products') return [product]; if (table.name === 'productDetails') return []; return draft[table.name].filter(row => row[condition.column] === condition.value); } }; } }; } }; },
    insert(table) { return { values(value) { const run = () => { if (table.name === failTable) throw new Error('private database diagnostic'); const row = { id: draft[table.name].length + 1, ...value }; draft[table.name].push(row); return [row]; }; return { returning: async () => run(), then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject) }; } }; }
   };
   const result = await fn(tx);
   Object.assign(state, draft);
   return result;
 } };
 const { POST } = evaluate(route, {
  '@/db': { db }, '@/db/schema': tables, '@/lib/admin-auth': { getAdminUser: async () => null }, '@/lib/payments/token-plan': tokenPlan,
  'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }) } },
  'drizzle-orm': { eq: (column,value) => ({column,value}), desc: x => x, sql: (parts,...values) => ({parts,values}) },
 });
 return { state, counts: () => ({transactions,locks}), request: (body = payload, key = 'checkout_test_key_123') => POST(new Request('http://localhost/api/storefront/orders', { method: 'POST', headers: key ? {'Idempotency-Key':key} : {}, body: typeof body === 'string' ? body : JSON.stringify(body) })) };
}
test('order, backend record and audit commit together with server-derived totals', async () => {
 const app = setup(); const response = await app.request({...payload, totalAmountInr: '0.01'}); const result = await response.json();
 assert.equal(response.status,201); assert.equal(result.paymentPlan.totalAmountInr,200);
 for(const rows of Object.values(app.state)) assert.equal(rows.length,1);
 assert.deepEqual(app.counts(),{transactions:1,locks:1});
});
for (const failTable of ['orders','aiActivityLogs']) test(`failure writing ${failTable} rolls back all records and hides database details`, async () => {
 const app = setup({failTable}); const response = await app.request();
 assert.equal(response.status,500); assert.doesNotMatch(await response.text(),/private database diagnostic/);
 for(const rows of Object.values(app.state)) assert.equal(rows.length,0);
});
test('retry returns the original reference and creates no duplicate rows', async () => {
 const app=setup();const first=await (await app.request()).json();const retry=await app.request();const second=await retry.json();
 assert.equal(retry.status,200);assert.equal(first.ref,second.ref);assert.deepEqual(first.paymentPlan,second.paymentPlan);
 for(const rows of Object.values(app.state)) assert.equal(rows.length,1);
});
test('a reused key with changed order details is rejected',async()=>{
 const app=setup();await app.request();assert.equal((await app.request({...payload,quantity:3})).status,409);assert.equal(app.state.orders.length,1);
});
test('legacy requests without keys receive distinct unpredictable references',async()=>{
 const app=setup();const a=await(await app.request(payload,null)).json();const b=await(await app.request(payload,null)).json();assert.notEqual(a.ref,b.ref);
});
test('invalid JSON, fields, IDs and keys are rejected before accessing the database',async()=>{
 for(const [body,key] of [['{',undefined],[null,undefined],[{...payload,productId:-1},undefined],[{...payload,customerName:{}},undefined],[payload,'bad']]){
  const app=setup();assert.equal((await app.request(body,key)).status,400);assert.equal(app.counts().transactions,0);
 }
});
test('unusable catalogue prices cannot create orders',async()=>{
 for(const price of ['NaN','0','-10']){const app=setup({price});assert.equal((await app.request()).status,409);assert.equal(app.state.orders.length,0);}
});
