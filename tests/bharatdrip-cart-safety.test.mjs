import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/components/bharatdrip/cart-context.tsx'), 'utf8');

test('BharatDrip restores persisted cart from canonical products instead of trusting stored prices', () => {
  assert.match(source, /export function restoreCart/);
  assert.match(source, /products\.find\(\(item\) => item\.id === productId\)/);
  assert.match(source, /setItems\(restoreCart\(JSON\.parse\(stored\)\)\)/);
  assert.match(source, /product\.sizes\.includes\(size\)/);
  assert.match(source, /MAX_LINE_QUANTITY/);
});

test('BharatDrip storage failures remain non-fatal', () => {
  assert.match(source, /try\s*\{[\s\S]*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(items\)\)[\s\S]*\}\s*catch/);
});

test('BharatDrip checkout cannot invent or clear a fake order', () => {
  assert.doesNotMatch(source, /Math\.random\(/);
  assert.doesNotMatch(source, /Order confirmed/);
  assert.doesNotMatch(source, /setView\(["']success["']\)/);
  assert.match(source, /no order was created and no payment was attempted/i);
  assert.match(source, /Checkout is a preview only/i);
});
