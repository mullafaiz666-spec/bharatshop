import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: path })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const gateway = load('src/lib/payments/gateway.ts');

test('Cashfree App ID and Secret Key deployment aliases are accepted', () => {
  delete process.env.CASHFREE_CLIENT_ID;
  delete process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_APP_ID = 'cf-app-id';
  process.env.CASHFREE_SECRET_KEY = 'cf-secret';
  assert.deepEqual(gateway.cashfreeCredentials(), { clientId: 'cf-app-id', clientSecret: 'cf-secret' });
});

test('Cashfree production environment aliases resolve to live mode', () => {
  delete process.env.PAYMENT_MODE;
  process.env.CASHFREE_ENV = 'production';
  assert.equal(gateway.gatewayMode(), 'live');
  assert.equal(gateway.cashfreeBaseUrl(), 'https://api.cashfree.com/pg');
  process.env.CASHFREE_ENV = 'test';
  assert.equal(gateway.gatewayMode(), 'test');
  assert.equal(gateway.cashfreeBaseUrl(), 'https://sandbox.cashfree.com/pg');
});
