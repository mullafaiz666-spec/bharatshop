import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: path })(
    name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const gateway = load('src/lib/payments/gateway.ts');
const events = load('src/lib/payments/payment-events.ts');
const meta = load('src/lib/payments/token-plan.ts');
const next = { NextResponse: { json: (data, options) => Response.json(data, options) } };

test('malformed or modified webhook signatures are rejected without throwing', () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test-secret';
  process.env.CASHFREE_CLIENT_SECRET = 'test-cashfree';
  delete process.env.CASHFREE_WEBHOOK_SECRET;
  const raw = '{"amount":100.00}', timestamp = '1788947082000';
  const rp = crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex');
  const cf = crypto.createHmac('sha256', 'test-cashfree').update(timestamp + raw).digest('base64');
  assert.equal(gateway.verifyRazorpayWebhook(raw, rp), true);
  assert.equal(gateway.verifyCashfreeWebhook(raw, timestamp, cf), true);
  for (const sig of ['', 'x', rp + 'junk', '🦊']) {
    assert.equal(gateway.verifyRazorpayWebhook(raw, sig), false);
    assert.equal(gateway.verifyCashfreeWebhook(raw, timestamp, sig), false);
  }
  assert.equal(gateway.verifyCashfreeWebhook('{"amount":100}', timestamp, cf), false);
  assert.equal(gateway.verifyCashfreeWebhook(raw, timestamp + '1', cf), false);
});

test('Cashfree refund and unknown success events cannot mark an order paid', () => {
  assert.equal(events.cashfreePaymentEvent('PAYMENT_SUCCESS_WEBHOOK', 'SUCCESS', ''), 'TOKEN_PAID');
  assert.equal(events.cashfreePaymentEvent('PAYMENT_SUCCESS_WEBHOOK', 'PENDING', ''), null);
  assert.equal(events.cashfreePaymentEvent('REFUND_STATUS_WEBHOOK', '', 'SUCCESS'), 'TOKEN_REFUNDED');
  assert.equal(events.cashfreePaymentEvent('REFUND_STATUS_WEBHOOK', '', 'PENDING'), null);
  assert.equal(events.cashfreePaymentEvent('OTHER_SUCCESS', '', ''), null);
});

test('COD token and balance reconcile, including minimum and capped deposits', () => {
  for (const input of [
    { sellingPriceInr: 499, netProfitInr: 100, quantity: 2 },
    { sellingPriceInr: 20, netProfitInr: 0, quantity: 1 },
    { sellingPriceInr: 100, netProfitInr: 200, quantity: 1 },
  ]) {
    const plan = meta.partialCodPlan(input);
    assert.equal(plan.confirmationAmountInr + plan.codBalanceInr, plan.totalAmountInr);
    assert.ok(plan.codBalanceInr >= 0);
  }
  assert.equal(meta.readPaymentMeta('razorpay_order_id=old | razorpay_order_id=current', 'razorpay_order_id'), 'current');
});

function stateHarness() {
  const storefront = { id: 1, orderRef: 'BS-TEST', paymentMode: 'PARTIAL_COD_RAZORPAY', paymentStatus: 'TOKEN_PENDING',
    fulfillmentStatus: 'TOKEN_PAYMENT_PENDING', notes: 'razorpay_order_id=order_test | confirmation_amount_inr=100 | cod_balance_inr=399' };
  const schema = { storefrontOrders: { notes: 'notes', id: 'id' }, orders: { orderNumber: 'orderNumber', id: 'id' }, aiActivityLogs: {} };
  const core = { id: 1, userId: 1, aiDecisionLog: '', paymentStatus: 'TOKEN_PENDING' };
  let logs = 0;
  const tx = {
    select: () => ({ from: table => ({ where: () => ({ for: async () => [storefront], limit: async () => table === schema.orders ? [core] : [storefront] }) }) }),
    update: table => ({ set: patch => ({ where: async () => Object.assign(table === schema.orders ? core : storefront, patch) }) }),
    insert: () => ({ values: async () => { logs++; } }),
  };
  const state = load('src/lib/payments/order-state.ts', {
    '@/db': { db: { transaction: fn => fn(tx) } }, '@/db/schema': schema,
    'drizzle-orm': { eq: () => true, like: () => true },
    '@/lib/payments/token-plan': meta, '@/lib/payments/payment-events': events,
  });
  return { state, storefront, core, logs: () => logs };
}
const paid = { provider: 'razorpay', providerOrderId: 'order_test', status: 'TOKEN_PAID', event: 'payment.captured', amountInr: 100, currency: 'INR' };

test('payment state rejects wrong amount/currency before writes', async () => {
  const h = stateHarness();
  for (const change of [{ amountInr: 99 }, { amountInr: NaN }, { currency: 'USD' }]) {
    await assert.rejects(h.state.markGatewayPayment({ ...paid, ...change }), /amount or currency/);
  }
  assert.equal(h.storefront.paymentStatus, 'TOKEN_PENDING');
  assert.equal(h.logs(), 0);
});

test('payment replays do not reroute fulfilment or double-count; refund is terminal', async () => {
  const h = stateHarness();
  assert.equal((await h.state.markGatewayPayment(paid)).verified, true);
  h.storefront.fulfillmentStatus = 'SHIPPED';
  await h.state.markGatewayPayment(paid);
  await h.state.markGatewayPayment({ ...paid, status: 'TOKEN_FAILED' });
  assert.equal(h.storefront.fulfillmentStatus, 'SHIPPED');
  assert.equal(h.logs(), 1);
  await h.state.markGatewayPayment({ ...paid, status: 'TOKEN_REFUNDED' });
  assert.equal((await h.state.markGatewayPayment(paid)).verified, false);
  assert.equal(h.storefront.paymentStatus, 'TOKEN_REFUNDED');
  assert.equal(h.core.paymentStatus, 'TOKEN_REFUNDED');
});

test('Razorpay signed-but-authorized payment cannot release fulfilment', async t => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_example';
  process.env.RAZORPAY_KEY_SECRET = 'test-secret';
  let writes = 0;
  const route = load('src/app/api/payments/razorpay/verify/route.ts', {
    'next/server': next, '@/lib/payments/gateway': gateway,
    '@/lib/payments/order-state': { markGatewayPayment: async input => { writes++; assert.equal(input.amountInr, 100); return { matched: 1, verified: true }; } },
  });
  const signature = crypto.createHmac('sha256', 'test-secret').update('order_test|pay_test').digest('hex');
  const request = () => new Request('http://localhost/api/payments/razorpay/verify', { method: 'POST', body: JSON.stringify({ razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: signature }) });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ order_id: 'order_test', status: 'authorized', captured: false }));
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(writes, 0);
  fetchMock.mock.mockImplementation(async () => Response.json({ order_id: 'order_test', status: 'captured', captured: true, amount: 10000, currency: 'INR' }));
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(writes, 1);
});

test('Cashfree status does not claim success for an unmatched or refunded order', async () => {
  process.env.CASHFREE_CLIENT_ID = 'test'; process.env.CASHFREE_CLIENT_SECRET = 'test';
  for (const state of [{ matched: 0, verified: false }, { matched: 1, verified: false }]) {
    const route = load('src/app/api/payments/cashfree/status/route.ts', {
      'next/server': next, '@/lib/payments/gateway': { fetchCashfreeOrder: async () => ({ order_status: 'PAID', order_amount: 100, order_currency: 'INR' }) },
      '@/lib/payments/order-state': { markGatewayPayment: async () => state },
    });
    const response = await route.GET(new Request('http://localhost/api/payments/cashfree/status?gateway_order_id=test'));
    assert.notEqual((await response.json()).verified, true);
  }
});

test('marketing credentials alone never produce VERIFIED status; read-only probe can', async t => {
  for (const key of Object.keys(process.env)) if (key.startsWith('META_') || key.startsWith('GOOGLE_ADS_')) delete process.env[key];
  process.env.META_ACCESS_TOKEN = 'test-token'; process.env.META_AD_ACCOUNT_ID = 'act_123';
  const connections = load('src/lib/marketing/connections.ts');
  assert.equal(connections.marketingConnections().find(c => c.key === 'meta').status, 'NOT_TESTED');
  const mock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method ?? 'GET', 'GET');
    assert.ok(url.includes('/act_123?fields='));
    return Response.json({ id: 'act_123', account_status: 1 });
  });
  assert.equal((await connections.verifyMarketingConnections()).find(c => c.key === 'meta').status, 'VERIFIED');
  mock.mock.mockImplementation(async () => new Response('', { status: 401 }));
  assert.equal((await connections.verifyMarketingConnections()).find(c => c.key === 'meta').status, 'BROKEN');
});

test('public image URLs reject bind addresses and use the configured Render origin', () => {
  const origin = load('src/lib/public-origin.ts');
  process.env.PUBLIC_APP_URL = 'https://0.0.0.0:10000';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  process.env.RENDER_EXTERNAL_URL = 'https://bharatshop-9w4a.onrender.com';
  assert.equal(origin.publicOrigin(), 'https://bharatshop-9w4a.onrender.com');
});

test('Gradio requires a completed image event, never heartbeat/error data', () => {
  const editorial = load('src/lib/fashion/editorial-image.ts');
  assert.throws(() => editorial.parseCompleteEvent('event: heartbeat\ndata: null\n\n'), /no complete/);
  assert.throws(() => editorial.parseCompleteEvent('event: error\ndata: null\n\n'), /no image was produced/);
  assert.deepEqual(editorial.parseCompleteEvent('event: complete\r\ndata: [{"url":"https://example.com/image.webp"}]\r\n\r\n'), [{ url: 'https://example.com/image.webp' }]);
});
