import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/components/bharatdrip/cart-context.tsx'), 'utf8');

test('BharatDrip restores persisted cart from canonical products instead of trusting stored prices', () => {
  assert.match(source, /export function restoreCart/);
  assert.match(source, /catalogue\.find\(\(item\) => item\.id === productId\)/);
  assert.match(source, /setItems\(restoreCart\(JSON\.parse\(stored\), catalogue\)\)/);
  assert.match(source, /product\.sizes\.includes\(size\)/);
  assert.match(source, /MAX_LINE_QUANTITY/);
});

test('BharatDrip storage failures remain non-fatal', () => {
  assert.match(source, /try\s*\{[\s\S]*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(items\)\)[\s\S]*\}\s*catch/);
});

test('BharatDrip checkout uses the real order gateway and requires verified payment for live drops', () => {
  assert.doesNotMatch(source, /Math\.random\(/);
  assert.doesNotMatch(source, /Order confirmed/);
  assert.match(source, /\/api\/storefront\/orders/);
  assert.match(source, /product\.liveProductId/);
  assert.match(source, /PARTIAL_COD_RAZORPAY/);
  assert.match(source, /PARTIAL_COD_CASHFREE/);
  assert.match(source, /\/api\/payments\/razorpay\/verify/);
  assert.match(source, /verified\.verified/);
  assert.match(source, /setView\("success"\)/);
  assert.match(source, /No order was created and no payment was attempted/i);
  assert.match(source, /Checkout is a preview only/i);
  assert.match(source, /will not fall back to unprotected COD/i);
});


test('BharatDrip cart provider can rehydrate live database products without trusting persisted prices', () => {
  assert.match(source, /catalogue = staticProducts/);
  assert.match(source, /restoreCart\(value: unknown, catalogue: Product\[\]/);
  assert.match(source, /catalogue\.find\(\(item\) => item\.id === productId\)/);
});
