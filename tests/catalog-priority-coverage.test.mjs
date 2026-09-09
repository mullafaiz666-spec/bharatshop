import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  runInThisContext(`(function(require,module,exports){${code}\n})`)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const { criticalCoverageKey, criticalCoverageCounts, criticalFirst, CRITICAL_DISCOVERY_QUERIES } = load('src/lib/catalog/priority-coverage.ts');

test('critical catalogue matcher distinguishes requested merchandising buckets', () => {
  assert.equal(criticalCoverageKey({ title: '43 inch 4K Smart TV' }), 'tv');
  assert.equal(criticalCoverageKey({ title: 'Ryzen 5 Laptop 16GB RAM' }), 'laptop');
  assert.equal(criticalCoverageKey({ title: 'Double Door Refrigerator 340 L' }), 'refrigerator');
  assert.equal(criticalCoverageKey({ title: '1.5 Ton Inverter Split AC' }), 'airConditioner');
  assert.equal(criticalCoverageKey({ title: '8 kg Front Load Washing Machine' }), 'washingMachine');
  assert.equal(criticalCoverageKey({ brand: 'BharatDrip', madeToOrder: true }), 'fashion');
});

test('critical discovery explicitly searches every requested big-ticket category', () => {
  const joined = CRITICAL_DISCOVERY_QUERIES.join(' ').toLowerCase();
  for (const term of ['fashion', 'smart tv', 'laptop', 'refrigerator', 'washing machine', 'air conditioner']) assert.ok(joined.includes(term));
});

test('critical-first selection prevents one broad category from starving appliance subtypes', () => {
  const rows = [
    { id: 1, title: 'Generic kitchen appliance', category: 'Appliances' },
    { id: 2, title: 'Double Door Refrigerator', category: 'Appliances' },
    { id: 3, title: 'Front Load Washing Machine', category: 'Appliances' },
    { id: 4, title: '1.5 Ton Split AC', category: 'Appliances' },
    { id: 5, title: 'Smart TV 43 inch', category: 'TV & Home Entertainment' },
    { id: 6, title: 'Core i5 Laptop', category: 'Laptops & Computers' },
  ];
  const ordered = criticalFirst(rows, x => x);
  const firstFive = ordered.slice(0, 5).map(x => criticalCoverageKey(x));
  for (const key of ['tv', 'laptop', 'refrigerator', 'airConditioner', 'washingMachine']) assert.ok(firstFive.includes(key));
  assert.deepEqual(criticalCoverageCounts(rows, x => x), { fashion: 0, tv: 1, laptop: 1, refrigerator: 1, airConditioner: 1, washingMachine: 1 });
});

test('storefront fashion visibility no longer depends on external photoreal editorial generation', () => {
  const route = readFileSync(new URL('../src/app/api/storefront/products/route.ts', import.meta.url), 'utf8');
  assert.match(route, /const mediaReady=mto\?gallery\.length>=MIN_FASHION_IMAGES:gallery\.length>=MIN_STANDARD_IMAGES/);
  assert.doesNotMatch(route, /mediaReady=mto\?gallery\.length>=MIN_FASHION_IMAGES&&gallery\.some\(x=>x\.editorial\)/);
  assert.match(route, /criticalCoverage/);
});
