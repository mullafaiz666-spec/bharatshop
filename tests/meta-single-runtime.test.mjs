import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
const marketing = readFileSync(new URL('../src/components/MarketingPixels.tsx', import.meta.url), 'utf8');

test('root layout mounts the unified MarketingPixels runtime', () => {
  assert.match(layout, /import MarketingPixels from ["']@\/components\/MarketingPixels["']/);
  assert.match(layout, /<MarketingPixels\s*\/>/);
  assert.ok(!layout.includes('@/components/meta-pixel'));
});

test('unified Meta runtime uses NEXT_PUBLIC_META_PIXEL_ID and route-aware PageView', () => {
  assert.ok(marketing.includes('NEXT_PUBLIC_META_PIXEL_ID'));
  assert.ok(marketing.includes("fbq('init'"));
  assert.ok(marketing.includes('emitMeta("page_view"'));
});

test('duplicate legacy MetaPixel component is absent', () => {
  assert.equal(existsSync(new URL('../src/components/meta-pixel.tsx', import.meta.url)), false);
});
