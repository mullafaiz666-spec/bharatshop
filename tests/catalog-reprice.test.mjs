import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/catalog/economics-policy.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
runInThisContext(`(function(exports){${code}\n})`)(compiledModule.exports);
const { catalogReprice } = compiledModule.exports;

test('repricing keeps an electronics price that meets category economics', () => {
  const result = catalogReprice({ category: 'Laptops & Computers', cost: 40000, currentPrice: 43000, targetPrice: 43500, ceiling: 44000 });
  assert.equal(result.viable, true);
  assert.equal(result.price, 43000);
});
test('repricing enforces absolute profit as well as margin', () => {
  const result = catalogReprice({ category: 'Mobiles & Tablets', cost: 1000, currentPrice: 1100, targetPrice: 1100, ceiling: 1150 });
  assert.equal(result.viable, false);
  assert.equal(result.price, 1200);
});
test('repricing never exceeds a market ceiling or accepts nonfinite economics', () => {
  for (const change of [{ ceiling: 41000 }, { cost: NaN }, { targetPrice: Infinity }, { ceiling: NaN }]) {
    const result = catalogReprice({ category: 'Laptops & Computers', cost: 40000, currentPrice: 43000, targetPrice: 43500, ceiling: 44000, ...change });
    assert.equal(result.viable, false);
  }
});
